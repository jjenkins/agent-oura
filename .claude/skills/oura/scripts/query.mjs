// Generic Oura query script: single-endpoint, multi-endpoint, and correlation modes.
// Outputs JSON to stdout — Claude reads and interprets the results.
// Usage:
//   node query.mjs --endpoint daily_sleep [--start YYYY-MM-DD] [--end YYYY-MM-DD]
//   node query.mjs --endpoints daily_sleep,daily_readiness [--start YYYY-MM-DD] [--end YYYY-MM-DD]
//   node query.mjs --correlate daily_sleep,daily_readiness [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--offset N]

import { ouraGetWithRetry } from './client.mjs';

// --- Arg parsing ---
const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

const endpoint  = getArg('endpoint');    // single-endpoint mode
const endpoints = getArg('endpoints');   // multi-endpoint mode (comma-separated)
const correlate = getArg('correlate');   // correlation mode (comma-separated pair) — Plan 02
const startArg  = getArg('start');       // start date YYYY-MM-DD
const endArg    = getArg('end');         // end date YYYY-MM-DD
const offsetArg = getArg('offset');      // day offset for correlation — Plan 02

// --- Date range ---
// Derives start/end with 7-day default and 60-day warning.
// Uses toLocaleDateString('en-CA') to get YYYY-MM-DD in local timezone (same as dashboard.mjs).
function getDateRange(startArg, endArg) {
  const today = new Date();
  const end = endArg ? endArg : today.toLocaleDateString('en-CA');

  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 7);
  const start = startArg ? startArg : defaultStart.toLocaleDateString('en-CA');

  // Oura API date filtering is start-inclusive, end-exclusive.
  // When start === end, bump end by one day so the single day is included.
  let effectiveEnd = end;
  if (start === effectiveEnd) {
    // Add one day using string parsing to avoid UTC vs local timezone issues.
    const [y, m, d] = effectiveEnd.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1); // local date constructor
    effectiveEnd = next.toLocaleDateString('en-CA');
  }

  const msPerDay = 86_400_000;
  const daysDiff = (new Date(effectiveEnd) - new Date(start)) / msPerDay;
  const warning = daysDiff > 60
    ? `Date range (${Math.round(daysDiff)} days) exceeds Oura API ~60-day limit. Results may be incomplete.`
    : null;

  return { start, end: effectiveEnd, warning };
}

// --- Endpoint-aware param builder ---
// Heart rate endpoint uses start_datetime/end_datetime (ISO 8601).
// All other endpoints use start_date/end_date (YYYY-MM-DD).
function buildParams(endpoint, startDate, endDate) {
  if (endpoint === 'heartrate') {
    return {
      start_datetime: `${startDate}T00:00:00`,
      end_datetime:   `${endDate}T23:59:59`,
    };
  }
  return { start_date: startDate, end_date: endDate };
}

// --- Pagination ---
// Transparently fetches all pages via next_token loop.
// Oura returns next_token in the response when more pages are available.
async function fetchAllPages(endpoint, params) {
  let allRecords = [];
  let queryParams = { ...params };

  do {
    const json = await ouraGetWithRetry(`/usercollection/${endpoint}`, queryParams);
    allRecords = allRecords.concat(json.data ?? []);
    if (json.next_token) {
      queryParams = { ...queryParams, next_token: json.next_token };
    } else {
      break;
    }
  } while (true);

  return allRecords;
}

// --- Heart rate aggregation ---
// Aggregates per-sample heart rate records into per-day buckets.
// A 7-day query can return thousands of samples — aggregate before output (Research Pitfall 3).
function aggregateHeartRateByDay(samples) {
  const byDay = new Map();

  for (const sample of samples) {
    const day = sample.timestamp.slice(0, 10); // YYYY-MM-DD from ISO string
    if (!byDay.has(day)) byDay.set(day, { bpms: [], sources: {} });
    const bucket = byDay.get(day);
    bucket.bpms.push(sample.bpm);
    bucket.sources[sample.source] = (bucket.sources[sample.source] ?? 0) + 1;
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bucket]) => ({
      day,
      bpm_avg: Math.round(bucket.bpms.reduce((a, b) => a + b, 0) / bucket.bpms.length),
      bpm_min: Math.min(...bucket.bpms),
      bpm_max: Math.max(...bucket.bpms),
      sample_count: bucket.bpms.length,
      sources: bucket.sources,
    }));
}

// --- Summary stats computation ---
// Computes avg, min, max, trend, and count for a numeric field across records.
// fieldFn extracts the numeric value from each record.
function computeStats(records, fieldFn) {
  const values = records.map(fieldFn).filter(v => v !== null && v !== undefined);
  if (values.length === 0) {
    return { avg: null, min: null, max: null, trend: null, count: 0 };
  }

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const count = values.length;

  // Trend: compare second-half average to first-half average.
  // Difference > 2 = improving, < -2 = declining, else stable.
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const firstHalfAvg = firstHalf.length > 0
    ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    : avg;
  const secondHalfAvg = secondHalf.length > 0
    ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    : avg;
  const diff = secondHalfAvg - firstHalfAvg;
  const trend = diff > 2 ? 'improving' : diff < -2 ? 'declining' : 'stable';

  return { avg: Math.round(avg * 10) / 10, min, max, trend, count };
}

// --- Stress value-count summary ---
// daily_stress has no numeric score — use day_summary string count instead.
// Returns an object like { "restored": 3, "normal": 2, "stressed": 1 }.
function stressSummary(records) {
  const counts = {};
  for (const record of records) {
    const val = record.day_summary ?? 'unknown';
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

// --- Field extraction mapping ---
// Maps endpoint names to their primary numeric field accessor.
// Endpoints not listed here (workout, session) have no single summary score.
const FIELD_MAP = {
  daily_sleep:     r => r.score,
  daily_readiness: r => r.score,
  daily_activity:  r => r.score,
  daily_spo2:      r => r.spo2_percentage?.average,
  // heartrate: handled separately via aggregateHeartRateByDay + bpm_avg
  // daily_stress: handled separately via stressSummary
  // workout: no single score — Claude interprets raw records
  // session: no single score — Claude interprets raw records
};

// --- Pearson correlation coefficient ---
// Computes Pearson r between two arrays of numeric values.
// Returns null if insufficient data or no variance in either array.
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num  += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return null;
  return num / denom;
}

// --- Correlation semantic bridge ---
// Translates a Pearson r value to a human-readable category.
function correlationCategory(r) {
  if (r === null)  return 'Insufficient Data';
  if (r >= 0.7)   return 'Strong Positive';
  if (r >= 0.3)   return 'Moderate Positive';
  if (r > -0.3)   return 'No Significant Correlation';
  if (r > -0.7)   return 'Moderate Negative';
  return 'Strong Negative';
}

// --- Value extraction for correlation ---
// Returns an array of { day, value } objects sorted ascending by day.
// Returns null for endpoints that lack a single numeric score.
function extractValues(records, ep) {
  // Endpoints not supported for correlation (no single numeric score).
  if (ep === 'daily_stress' || ep === 'workout' || ep === 'session') {
    return null;
  }

  let pairs;
  if (ep === 'heartrate') {
    // records are already aggregated daily buckets with bpm_avg.
    pairs = records.map(r => ({ day: r.day, value: r.bpm_avg }));
  } else if (FIELD_MAP[ep]) {
    pairs = records.map(r => ({ day: r.day, value: FIELD_MAP[ep](r) }));
  } else {
    return null;
  }

  return pairs
    .filter(p => p.value !== null && p.value !== undefined)
    .sort((a, b) => a.day.localeCompare(b.day));
}

// --- Single-endpoint processing ---
// Fetches all records for one endpoint and computes appropriate summary.
async function processSingleEndpoint(ep, start, end) {
  const params = buildParams(ep, start, end);
  let records = await fetchAllPages(ep, params);
  let summary;

  if (ep === 'heartrate') {
    // Aggregate samples to daily buckets; compute stats on daily averages.
    records = aggregateHeartRateByDay(records);
    summary = computeStats(records, r => r.bpm_avg);
  } else if (ep === 'daily_stress') {
    // No numeric score — return value-count summary.
    summary = stressSummary(records);
  } else if (FIELD_MAP[ep]) {
    summary = computeStats(records, FIELD_MAP[ep]);
  } else {
    // workout, session: no numeric summary — Claude interprets raw records.
    summary = null;
  }

  // Strip bulky fields that are never interpreted (minute-by-minute MET data,
  // 5-min activity class strings). These dominate output size on multi-day queries.
  if (ep === 'daily_activity') {
    records = records.map(({ met, class_5_min, ...rest }) => rest);
  }

  return { summary, records };
}

// --- Main ---
try {
  // Correlation mode — computes Pearson r between two endpoints with optional day offset.
  if (correlate) {
    const [endpointA, endpointB] = correlate.split(',').map(e => e.trim());
    const SUPPORTED_FOR_CORRELATION = ['daily_sleep', 'daily_readiness', 'daily_activity', 'daily_spo2', 'heartrate'];

    // Validate both endpoints support numeric correlation.
    for (const ep of [endpointA, endpointB]) {
      if (!SUPPORTED_FOR_CORRELATION.includes(ep)) {
        process.stdout.write(JSON.stringify({
          error: `Correlation not available for ${ep}. Supported: ${SUPPORTED_FOR_CORRELATION.join(', ')}.`,
        }, null, 2) + '\n');
        process.exit(0);
      }
    }

    const offset = parseInt(offsetArg ?? '0', 10);
    const { start, end, warning: dateWarning } = getDateRange(startArg, endArg);

    const paramsA = buildParams(endpointA, start, end);
    const paramsB = buildParams(endpointB, start, end);

    const [resultA, resultB] = await Promise.allSettled([
      fetchAllPages(endpointA, paramsA),
      fetchAllPages(endpointB, paramsB),
    ]);

    if (resultA.status === 'rejected') {
      process.stdout.write(JSON.stringify({
        error: `Failed to fetch ${endpointA}: ${resultA.reason?.message ?? String(resultA.reason)}`,
      }, null, 2) + '\n');
      process.exit(0);
    }
    if (resultB.status === 'rejected') {
      process.stdout.write(JSON.stringify({
        error: `Failed to fetch ${endpointB}: ${resultB.reason?.message ?? String(resultB.reason)}`,
      }, null, 2) + '\n');
      process.exit(0);
    }

    // Aggregate heartrate records to daily buckets before value extraction.
    let recordsA = resultA.value;
    let recordsB = resultB.value;
    if (endpointA === 'heartrate') recordsA = aggregateHeartRateByDay(recordsA);
    if (endpointB === 'heartrate') recordsB = aggregateHeartRateByDay(recordsB);

    const valuesA = extractValues(recordsA, endpointA);
    const valuesB = extractValues(recordsB, endpointB);

    // Build O(1) lookup map for B values keyed by day string.
    const mapB = new Map(valuesB.map(v => [v.day, v.value]));

    // Offset alignment: match A[day N] with B[day N + offset].
    const MS_PER_DAY = 86_400_000;
    const alignedPairs = [];
    for (const a of valuesA) {
      const dateA = new Date(a.day);
      const targetDay = new Date(dateA.getTime() + offset * MS_PER_DAY)
        .toISOString().slice(0, 10);
      const valB = mapB.get(targetDay);
      if (valB !== undefined) {
        alignedPairs.push({ day_a: a.day, value_a: a.value, day_b: targetDay, value_b: valB });
      }
    }

    const xs = alignedPairs.map(p => p.value_a);
    const ys = alignedPairs.map(p => p.value_b);

    let sampleWarning = dateWarning;
    if (alignedPairs.length < 7) {
      const msg = `Only ${alignedPairs.length} days of aligned data -- correlation may not be statistically meaningful`;
      sampleWarning = sampleWarning ? `${sampleWarning}; ${msg}` : msg;
    }

    const r = pearson(xs, ys);
    const category = correlationCategory(r);

    process.stdout.write(JSON.stringify({
      mode: 'correlation',
      endpoint_a: endpointA,
      endpoint_b: endpointB,
      offset_days: offset,
      start_date: start,
      end_date: end,
      warning: sampleWarning,
      correlation: {
        r,
        category,
        sample_size: alignedPairs.length,
      },
      aligned_pairs: alignedPairs,
    }, null, 2) + '\n');
    process.exit(0);
  }

  // Multi-endpoint mode.
  if (endpoints) {
    const { start, end, warning } = getDateRange(startArg, endArg);
    const endpointList = endpoints.split(',').map(e => e.trim()).filter(Boolean);

    const settled = await Promise.allSettled(
      endpointList.map(ep => processSingleEndpoint(ep, start, end))
    );

    const results = {};
    for (let i = 0; i < endpointList.length; i++) {
      const ep = endpointList[i];
      const result = settled[i];
      if (result.status === 'fulfilled') {
        results[ep] = { summary: result.value.summary, records: result.value.records };
      } else {
        results[ep] = { error: result.reason?.message ?? String(result.reason) };
      }
    }

    process.stdout.write(JSON.stringify({
      mode: 'multi',
      start_date: start,
      end_date: end,
      warning,
      results,
    }, null, 2) + '\n');
    process.exit(0);
  }

  // Single-endpoint mode.
  if (endpoint) {
    const { start, end, warning } = getDateRange(startArg, endArg);
    const { summary, records } = await processSingleEndpoint(endpoint, start, end);

    process.stdout.write(JSON.stringify({
      endpoint,
      start_date: start,
      end_date: end,
      warning,
      summary,
      records,
    }, null, 2) + '\n');
    process.exit(0);
  }

  // No mode specified.
  process.stdout.write(JSON.stringify({
    error: 'Usage: node query.mjs --endpoint <name> [--start YYYY-MM-DD] [--end YYYY-MM-DD]',
  }, null, 2) + '\n');
  process.exit(1);

} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
  process.exit(1);
}
