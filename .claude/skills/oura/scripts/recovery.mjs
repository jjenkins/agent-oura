// Physiological Recovery Cost Analysis
// Computes per-workout recovery curves, builds a personal regression model,
// and predicts recovery cost for hypothetical future workouts.
//
// Usage:
//   node recovery.mjs [--activity <type>] [--days <n>] [--predict] [--predict-duration <min>] [--predict-intensity <easy|moderate|hard>]

import { ouraGetWithRetry } from './client.mjs';

// --- Arg parsing ---
const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const activityFilter    = getArg('activity');       // e.g., "pickleball"
const daysBack          = parseInt(getArg('days') ?? '90', 10);
const predictMode       = hasFlag('predict');
const predictDuration   = parseInt(getArg('predict-duration') ?? '60', 10);
const predictIntensity  = getArg('predict-intensity') ?? 'moderate';

// --- Constants ---
const INTENSITY_MAP = { easy: 1, moderate: 2, hard: 3 };
const RECOVERY_WINDOW = 5;  // max nights to track post-workout
const MIN_WORKOUTS_FOR_REGRESSION = 15;
const BASELINE_WINDOW = 7;  // rolling average days for baseline

// --- Date helpers ---
function todayLocal() {
  return new Date().toLocaleDateString('en-CA');
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dt.toLocaleDateString('en-CA');
}

function daysBetween(a, b) {
  const msPerDay = 86_400_000;
  return Math.round((new Date(b) - new Date(a)) / msPerDay);
}

// --- Endpoint-aware param builder (matches query.mjs pattern) ---
function buildParams(endpoint, startDate, endDate) {
  if (endpoint === 'heartrate') {
    return {
      start_datetime: `${startDate}T00:00:00`,
      end_datetime: `${endDate}T23:59:59`,
    };
  }
  return { start_date: startDate, end_date: endDate };
}

// --- Pagination (matches query.mjs) ---
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

// --- Fetch all pages, but return empty array on DATA_NOT_SYNCED instead of throwing ---
async function fetchAllPagesSafe(endpoint, params) {
  try {
    return await fetchAllPages(endpoint, params);
  } catch (err) {
    if (err.message === 'Data not yet synced. Check the Oura app and try again in a few minutes.') {
      return [];
    }
    throw err;
  }
}

// --- Data fetching ---
async function fetchAllData(startDate, endDate) {
  const endpoints = [
    { name: 'workout', ep: 'workout' },
    { name: 'sleep', ep: 'sleep' },          // detailed sleep (not daily_sleep)
    { name: 'readiness', ep: 'daily_readiness' },
    { name: 'heartrate', ep: 'heartrate' },
    { name: 'stress', ep: 'daily_stress' },
    { name: 'resilience', ep: 'daily_resilience' },
  ];

  const results = await Promise.allSettled(
    endpoints.map(({ ep }) => fetchAllPagesSafe(ep, buildParams(ep, startDate, endDate)))
  );

  const data = {};
  for (let i = 0; i < endpoints.length; i++) {
    const { name } = endpoints[i];
    data[name] = results[i].status === 'fulfilled' ? results[i].value : [];
    if (results[i].status === 'rejected') {
      process.stderr.write(`Warning: failed to fetch ${name}: ${results[i].reason?.message}\n`);
    }
  }
  return data;
}

// --- Index data by day for O(1) lookups ---
function indexByDay(records, dayField = 'day') {
  const map = new Map();
  for (const r of records) {
    const day = r[dayField] ?? r.timestamp?.slice(0, 10);
    if (day) map.set(day, r);
  }
  return map;
}

// --- Index sleep records by day (use the 'day' field from detailed sleep endpoint) ---
function indexSleepByDay(sleepRecords) {
  // Detailed sleep endpoint can have multiple sleep periods per day (naps).
  // Use the longest period as the primary sleep for that night.
  const byDay = new Map();
  for (const r of sleepRecords) {
    const day = r.day;
    if (!day) continue;
    const existing = byDay.get(day);
    if (!existing || (r.total_sleep_duration ?? 0) > (existing.total_sleep_duration ?? 0)) {
      byDay.set(day, r);
    }
  }
  return byDay;
}

// --- Aggregate heart rate samples to daily resting HR ---
// Filter to nighttime/rest samples and compute daily averages.
function aggregateHeartRateByDay(samples) {
  const byDay = new Map();
  for (const sample of samples) {
    const day = sample.timestamp.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(sample.bpm);
  }

  const result = new Map();
  for (const [day, bpms] of byDay) {
    // Use min BPM as proxy for resting HR (actual resting HR is during sleep)
    const sorted = [...bpms].sort((a, b) => a - b);
    // Take the 10th percentile as resting HR estimate
    const p10Index = Math.floor(sorted.length * 0.1);
    result.set(day, {
      bpm_avg: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
      bpm_resting: sorted[p10Index] ?? sorted[0],
      bpm_min: sorted[0],
      bpm_max: sorted[sorted.length - 1],
    });
  }
  return result;
}

// --- Compute rolling baseline for a metric ---
// Returns the average of the metric over the BASELINE_WINDOW days ending on (but not including) targetDay.
function rollingBaseline(dayMap, targetDay, extractor) {
  const values = [];
  for (let i = 1; i <= BASELINE_WINDOW; i++) {
    const day = addDays(targetDay, -i);
    const record = dayMap.get(day);
    if (record) {
      const v = extractor(record);
      if (v !== null && v !== undefined && !isNaN(v)) values.push(v);
    }
  }
  if (values.length < 3) return null; // need at least 3 days for a meaningful baseline
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// --- Compute standard deviation ---
function stdDev(dayMap, targetDay, extractor) {
  const values = [];
  for (let i = 1; i <= BASELINE_WINDOW; i++) {
    const day = addDays(targetDay, -i);
    const record = dayMap.get(day);
    if (record) {
      const v = extractor(record);
      if (v !== null && v !== undefined && !isNaN(v)) values.push(v);
    }
  }
  if (values.length < 3) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// --- Build recovery curve for a single workout ---
function buildRecoveryCurve(workout, sleepMap, readinessMap, hrMap) {
  const workoutDay = workout.day;
  if (!workoutDay) return null;

  // Compute baselines
  const hrvBaseline = rollingBaseline(sleepMap, workoutDay, r => r.average_hrv);
  const rhrBaseline = rollingBaseline(sleepMap, workoutDay, r => r.average_heart_rate);
  const readinessBaseline = rollingBaseline(readinessMap, workoutDay, r => r.score);
  const tempBaseline = rollingBaseline(readinessMap, workoutDay, r => r.temperature_deviation);

  // Need at least HRV or readiness baseline to be meaningful
  if (hrvBaseline === null && readinessBaseline === null) return null;

  // Compute std devs for recovery threshold
  const hrvStdDev = stdDev(sleepMap, workoutDay, r => r.average_hrv);
  const rhrStdDev = stdDev(sleepMap, workoutDay, r => r.average_heart_rate);

  // Pre-workout state
  const preReadiness = readinessMap.get(workoutDay);
  const preDaySleep = sleepMap.get(workoutDay);
  const preStress = null; // stress is same-day, not pre-workout

  // Build the recovery trajectory
  const curve = [];
  let recoveryDays = null;
  let peakHrvDropPct = 0;
  let peakRhrRisePct = 0;

  for (let night = 1; night <= RECOVERY_WINDOW; night++) {
    const day = addDays(workoutDay, night);
    const sleep = sleepMap.get(day);
    const readiness = readinessMap.get(day);
    const hr = hrMap.get(day);

    if (!sleep && !readiness) continue;

    const hrvDeltaPct = (hrvBaseline && sleep?.average_hrv != null)
      ? ((sleep.average_hrv - hrvBaseline) / hrvBaseline) * 100
      : null;

    const rhrDeltaPct = (rhrBaseline && sleep?.average_heart_rate != null)
      ? ((sleep.average_heart_rate - rhrBaseline) / rhrBaseline) * 100
      : null;

    curve.push({
      night,
      day,
      hrv: sleep?.average_hrv ?? null,
      hrv_delta_pct: hrvDeltaPct !== null ? Math.round(hrvDeltaPct * 10) / 10 : null,
      rhr: sleep?.average_heart_rate ?? null,
      rhr_delta_pct: rhrDeltaPct !== null ? Math.round(rhrDeltaPct * 10) / 10 : null,
      readiness: readiness?.score ?? null,
      temp_deviation: readiness?.temperature_deviation ?? null,
    });

    if (hrvDeltaPct !== null && hrvDeltaPct < peakHrvDropPct) peakHrvDropPct = hrvDeltaPct;
    if (rhrDeltaPct !== null && rhrDeltaPct > peakRhrRisePct) peakRhrRisePct = rhrDeltaPct;

    // Check if recovered: HRV within 1 stddev of baseline
    if (recoveryDays === null && hrvBaseline !== null && hrvStdDev !== null && sleep?.average_hrv != null) {
      if (Math.abs(sleep.average_hrv - hrvBaseline) <= hrvStdDev) {
        recoveryDays = night;
      }
    }
  }

  if (curve.length === 0) return null;

  // If never recovered within window, use window size
  if (recoveryDays === null) recoveryDays = RECOVERY_WINDOW;

  // Readiness cost: baseline readiness minus lowest post-workout readiness
  const postReadinessScores = curve.map(c => c.readiness).filter(r => r != null);
  const lowestReadiness = postReadinessScores.length > 0 ? Math.min(...postReadinessScores) : null;
  const readinessCost = (readinessBaseline !== null && lowestReadiness !== null)
    ? Math.round(readinessBaseline - lowestReadiness)
    : null;

  // Duration in minutes
  let durationMinutes = null;
  if (workout.start_datetime && workout.end_datetime) {
    durationMinutes = Math.round(
      (new Date(workout.end_datetime) - new Date(workout.start_datetime)) / 60_000
    );
  }

  return {
    workout: {
      activity: workout.activity ?? 'unknown',
      label: workout.label ?? null,
      day: workoutDay,
      duration_minutes: durationMinutes,
      intensity: workout.intensity ?? 'unknown',
      calories: workout.calories ?? null,
    },
    baseline: {
      hrv_avg: hrvBaseline !== null ? Math.round(hrvBaseline * 10) / 10 : null,
      resting_hr_avg: rhrBaseline !== null ? Math.round(rhrBaseline * 10) / 10 : null,
      readiness_avg: readinessBaseline !== null ? Math.round(readinessBaseline) : null,
      temp_deviation_avg: tempBaseline !== null ? Math.round(tempBaseline * 100) / 100 : null,
    },
    recovery_curve: curve,
    recovery_days: recoveryDays,
    peak_hrv_drop_pct: Math.round(peakHrvDropPct * 10) / 10,
    peak_rhr_rise_pct: Math.round(peakRhrRisePct * 10) / 10,
    readiness_cost: readinessCost,
    interrupted: false, // set below
    pre_workout_state: {
      readiness: preReadiness?.score ?? null,
      sleep_score_night_before: null, // set below
      training_load_7d_hours: null,   // set below
      stress_day_summary: null,       // set below
    },
  };
}

// --- Detect overlapping recovery windows ---
function markInterruptions(recoveryResults) {
  for (let i = 0; i < recoveryResults.length; i++) {
    const r = recoveryResults[i];
    const workoutEnd = addDays(r.workout.day, r.recovery_days);

    for (let j = i + 1; j < recoveryResults.length; j++) {
      const next = recoveryResults[j];
      if (daysBetween(r.workout.day, next.workout.day) <= r.recovery_days) {
        r.interrupted = true;
        break;
      }
    }
  }
}

// --- Fill pre-workout state fields ---
function fillPreWorkoutState(recoveryResults, sleepMap, readinessMap, stressRecords, workouts) {
  const stressMap = indexByDay(stressRecords);

  for (const r of recoveryResults) {
    const day = r.workout.day;
    const prevDay = addDays(day, -1);

    // Sleep score night before — from detailed sleep endpoint
    const prevSleep = sleepMap.get(prevDay) ?? sleepMap.get(day);
    if (prevSleep) {
      // Detailed sleep doesn't have a 'score' — use efficiency as proxy, or average_hrv
      r.pre_workout_state.sleep_score_night_before = prevSleep.efficiency ?? null;
    }

    // Training load: total workout hours in prior 7 days
    let totalMinutes = 0;
    for (const w of workouts) {
      const wDay = w.day;
      if (!wDay) continue;
      const daysAgo = daysBetween(wDay, day);
      if (daysAgo > 0 && daysAgo <= 7) {
        if (w.start_datetime && w.end_datetime) {
          totalMinutes += (new Date(w.end_datetime) - new Date(w.start_datetime)) / 60_000;
        }
      }
    }
    r.pre_workout_state.training_load_7d_hours = Math.round(totalMinutes / 60 * 10) / 10;

    // Stress
    const stress = stressMap.get(day);
    r.pre_workout_state.stress_day_summary = stress?.day_summary ?? null;
  }
}

// --- OLS Regression via normal equation ---
// Solves beta = (X'X)^-1 X'y
function olsRegression(X, y) {
  const n = X.length;
  const p = X[0].length;

  // X'X
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }

  // X'y
  const Xty = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
    }
  }

  // Invert XtX using Gaussian elimination
  const inv = invertMatrix(XtX);
  if (!inv) return null;

  // beta = inv(X'X) * X'y
  const beta = Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < p; k++) {
      beta[j] += inv[j][k] * Xty[k];
    }
  }

  // R-squared
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    let yHat = 0;
    for (let j = 0; j < p; j++) yHat += X[i][j] * beta[j];
    ssRes += (y[i] - yHat) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { beta, rSquared };
}

// --- Gaussian elimination matrix inversion ---
function invertMatrix(matrix) {
  const n = matrix.length;
  const aug = matrix.map((row, i) => {
    const identityRow = Array(n).fill(0);
    identityRow[i] = 1;
    return [...row, ...identityRow];
  });

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) return null; // singular

    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map(row => row.slice(n));
}

// --- Build regression model ---
function buildRegressionModel(recoveryResults) {
  // Filter to workouts with complete data
  const valid = recoveryResults.filter(r =>
    r.readiness_cost !== null &&
    r.workout.duration_minutes !== null &&
    r.workout.intensity !== 'unknown' &&
    r.pre_workout_state.readiness !== null &&
    r.baseline.hrv_avg !== null &&
    !r.interrupted
  );

  if (valid.length < MIN_WORKOUTS_FOR_REGRESSION) {
    return {
      available: false,
      reason: `Need at least ${MIN_WORKOUTS_FOR_REGRESSION} workouts with complete recovery data (have ${valid.length})`,
      n_workouts: valid.length,
    };
  }

  const featureNames = [
    'intercept',
    'duration_minutes',
    'intensity_numeric',
    'pre_workout_readiness',
    'sleep_night_before',
    'training_load_7d_hours',
    'hrv_baseline',
  ];

  // Build feature matrix (with intercept column)
  const X = [];
  const y = [];

  for (const r of valid) {
    X.push([
      1, // intercept
      r.workout.duration_minutes,
      INTENSITY_MAP[r.workout.intensity] ?? 2,
      r.pre_workout_state.readiness,
      r.pre_workout_state.sleep_score_night_before ?? 80, // default if missing
      r.pre_workout_state.training_load_7d_hours ?? 0,
      r.baseline.hrv_avg,
    ]);
    y.push(r.readiness_cost);
  }

  const result = olsRegression(X, y);
  if (!result) {
    return { available: false, reason: 'Regression computation failed (singular matrix)', n_workouts: valid.length };
  }

  // Build coefficient map
  const coefficients = {};
  for (let i = 0; i < featureNames.length; i++) {
    coefficients[featureNames[i]] = Math.round(result.beta[i] * 1000) / 1000;
  }

  // Rank factors by absolute coefficient magnitude (excluding intercept)
  const ranked = featureNames.slice(1)
    .map((name, i) => ({ name, weight: Math.abs(result.beta[i + 1]) }))
    .sort((a, b) => b.weight - a.weight);

  return {
    available: true,
    r_squared: Math.round(result.rSquared * 100) / 100,
    n_workouts: valid.length,
    coefficients,
    significant_factors: ranked.slice(0, 3).map(f => f.name),
  };
}

// --- Predict recovery cost for a hypothetical workout ---
function predictRecoveryCost(model, recoveryResults, currentReadiness, currentHrv, duration, intensity) {
  if (!model.available) return null;

  // Current training load: sum workout hours in last 7 days from most recent data
  const now = todayLocal();
  let recentLoadMinutes = 0;
  for (const r of recoveryResults) {
    const daysAgo = daysBetween(r.workout.day, now);
    if (daysAgo >= 0 && daysAgo <= 7 && r.workout.duration_minutes) {
      recentLoadMinutes += r.workout.duration_minutes;
    }
  }
  const trainingLoad7d = recentLoadMinutes / 60;

  const features = [
    1, // intercept
    duration,
    INTENSITY_MAP[intensity] ?? 2,
    currentReadiness,
    80, // default sleep proxy
    trainingLoad7d,
    currentHrv,
  ];

  let predicted = 0;
  const coeffs = Object.values(model.coefficients);
  for (let i = 0; i < coeffs.length; i++) {
    predicted += coeffs[i] * features[i];
  }
  predicted = Math.max(0, Math.round(predicted));

  // Estimate recovery days from historical data with similar cost
  const similarCosts = recoveryResults
    .filter(r => r.readiness_cost !== null && Math.abs(r.readiness_cost - predicted) <= 5)
    .map(r => r.recovery_days);
  const estRecoveryDays = similarCosts.length > 0
    ? Math.round(similarCosts.reduce((a, b) => a + b, 0) / similarCosts.length)
    : predicted > 15 ? 3 : predicted > 8 ? 2 : 1;

  // Find comparable sessions
  const comparable = recoveryResults
    .filter(r => {
      const sameIntensity = r.workout.intensity === intensity;
      const similarDuration = r.workout.duration_minutes && Math.abs(r.workout.duration_minutes - duration) <= 30;
      return sameIntensity || similarDuration;
    })
    .sort((a, b) => Math.abs((a.readiness_cost ?? 0) - predicted) - Math.abs((b.readiness_cost ?? 0) - predicted))
    .slice(0, 3)
    .map(r => ({
      day: r.workout.day,
      activity: r.workout.activity,
      duration_minutes: r.workout.duration_minutes,
      intensity: r.workout.intensity,
      readiness_cost: r.readiness_cost,
      recovery_days: r.recovery_days,
    }));

  const confidence = model.n_workouts >= 30 ? 'high'
    : model.n_workouts >= 20 ? 'moderate'
    : 'low';

  return {
    scenario: `${intensity} ${activityFilter ?? 'workout'}, ${duration} min, current readiness ${currentReadiness}`,
    expected_readiness_cost: predicted,
    expected_recovery_days: estRecoveryDays,
    confidence: `${confidence} (${model.n_workouts} data points, R²=${model.r_squared})`,
    current_training_load_7d_hours: Math.round(trainingLoad7d * 10) / 10,
    comparable_sessions: comparable,
  };
}

// --- Generate narrative insights ---
function generateInsights(recoveryResults, model) {
  const insights = [];
  const warnings = [];

  if (recoveryResults.length === 0) return { insights, warnings };

  // Group by intensity
  const byIntensity = { easy: [], moderate: [], hard: [] };
  for (const r of recoveryResults) {
    const bucket = byIntensity[r.workout.intensity];
    if (bucket) bucket.push(r);
  }

  // HRV drop by intensity
  for (const [intensity, results] of Object.entries(byIntensity)) {
    const drops = results.map(r => r.peak_hrv_drop_pct).filter(d => d < 0);
    if (drops.length >= 3) {
      const avgDrop = Math.round(drops.reduce((a, b) => a + b, 0) / drops.length * 10) / 10;
      insights.push(`Your HRV drops ${Math.abs(avgDrop)}% on average after ${intensity} workouts (${drops.length} sessions)`);
    }
  }

  // Recovery duration comparison
  if (byIntensity.hard.length >= 3 && byIntensity.easy.length >= 3) {
    const hardAvg = byIntensity.hard.reduce((s, r) => s + r.recovery_days, 0) / byIntensity.hard.length;
    const easyAvg = byIntensity.easy.reduce((s, r) => s + r.recovery_days, 0) / byIntensity.easy.length;
    const diff = Math.round((hardAvg - easyAvg) * 10) / 10;
    if (diff > 0) {
      insights.push(`Hard workouts take ${diff} more recovery days on average than easy ones`);
    }
  }

  // Pre-workout readiness impact
  const withReadiness = recoveryResults.filter(r => r.pre_workout_state.readiness !== null && r.readiness_cost !== null);
  if (withReadiness.length >= 6) {
    const low = withReadiness.filter(r => r.pre_workout_state.readiness < 70);
    const high = withReadiness.filter(r => r.pre_workout_state.readiness >= 70);
    if (low.length >= 3 && high.length >= 3) {
      const lowCostAvg = low.reduce((s, r) => s + r.readiness_cost, 0) / low.length;
      const highCostAvg = high.reduce((s, r) => s + r.readiness_cost, 0) / high.length;
      const pctMore = Math.round(((lowCostAvg - highCostAvg) / highCostAvg) * 100);
      if (pctMore > 10) {
        insights.push(`Working out when readiness is below 70 costs ${pctMore}% more recovery time`);
      }
    }
  }

  // Training load threshold
  const withLoad = recoveryResults.filter(r => r.pre_workout_state.training_load_7d_hours !== null && r.recovery_days != null);
  if (withLoad.length >= 6) {
    const sorted = [...withLoad].sort((a, b) => a.pre_workout_state.training_load_7d_hours - b.pre_workout_state.training_load_7d_hours);
    const mid = Math.floor(sorted.length / 2);
    const lowLoad = sorted.slice(0, mid);
    const highLoad = sorted.slice(mid);
    const lowAvgRecovery = lowLoad.reduce((s, r) => s + r.recovery_days, 0) / lowLoad.length;
    const highAvgRecovery = highLoad.reduce((s, r) => s + r.recovery_days, 0) / highLoad.length;
    if (highAvgRecovery - lowAvgRecovery >= 0.5) {
      const threshold = sorted[mid].pre_workout_state.training_load_7d_hours;
      insights.push(`Recovery takes longer when your 7-day training load exceeds ${threshold} hours`);
    }
  }

  // Activity-specific insights
  if (activityFilter) {
    const filtered = recoveryResults.filter(r =>
      r.workout.activity.toLowerCase().includes(activityFilter.toLowerCase())
    );
    if (filtered.length >= 3) {
      const avgRecovery = Math.round(filtered.reduce((s, r) => s + r.recovery_days, 0) / filtered.length * 10) / 10;
      const avgCost = filtered.filter(r => r.readiness_cost !== null);
      if (avgCost.length > 0) {
        const costAvg = Math.round(avgCost.reduce((s, r) => s + r.readiness_cost, 0) / avgCost.length);
        insights.push(`${activityFilter} sessions: average recovery ${avgRecovery} days, average readiness cost ${costAvg} points (${filtered.length} sessions)`);
      }
    }
  }

  // Current state warnings
  const now = todayLocal();
  let recentLoadMinutes = 0;
  for (const r of recoveryResults) {
    const daysAgo = daysBetween(r.workout.day, now);
    if (daysAgo >= 0 && daysAgo <= 7 && r.workout.duration_minutes) {
      recentLoadMinutes += r.workout.duration_minutes;
    }
  }
  const currentLoad = recentLoadMinutes / 60;

  // Find the training load threshold (median split)
  if (withLoad.length >= 6) {
    const sorted = [...withLoad].sort((a, b) => a.pre_workout_state.training_load_7d_hours - b.pre_workout_state.training_load_7d_hours);
    const threshold = sorted[Math.floor(sorted.length / 2)].pre_workout_state.training_load_7d_hours;
    if (currentLoad > threshold) {
      warnings.push(`Current 7-day training load (${Math.round(currentLoad * 10) / 10}h) is above your recovery threshold (${threshold}h)`);
    }
  }

  // Check if most recent workout is still in recovery window
  if (recoveryResults.length > 0) {
    const mostRecent = recoveryResults[recoveryResults.length - 1];
    const daysSince = daysBetween(mostRecent.workout.day, now);
    if (daysSince < mostRecent.recovery_days) {
      warnings.push(`You may still be recovering from ${mostRecent.workout.activity} on ${mostRecent.workout.day} (${daysSince} of ~${mostRecent.recovery_days} recovery days elapsed)`);
    }
  }

  return { insights, warnings };
}

// --- Aggregate summary stats ---
function computeSummary(recoveryResults) {
  if (recoveryResults.length === 0) return null;

  const costs = recoveryResults.map(r => r.readiness_cost).filter(c => c !== null);
  const recoveryDays = recoveryResults.map(r => r.recovery_days);
  const hrvDrops = recoveryResults.map(r => r.peak_hrv_drop_pct).filter(d => d < 0);

  const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

  // Group by activity
  const byActivity = {};
  for (const r of recoveryResults) {
    const act = r.workout.activity;
    if (!byActivity[act]) byActivity[act] = { count: 0, costs: [], recovery_days: [] };
    byActivity[act].count++;
    if (r.readiness_cost !== null) byActivity[act].costs.push(r.readiness_cost);
    byActivity[act].recovery_days.push(r.recovery_days);
  }

  const activitySummary = {};
  for (const [act, data] of Object.entries(byActivity)) {
    activitySummary[act] = {
      count: data.count,
      avg_readiness_cost: avg(data.costs),
      avg_recovery_days: avg(data.recovery_days),
    };
  }

  return {
    total_workouts: recoveryResults.length,
    avg_readiness_cost: avg(costs),
    avg_recovery_days: avg(recoveryDays),
    avg_hrv_drop_pct: avg(hrvDrops),
    by_activity: activitySummary,
  };
}

// --- Main ---
try {
  const startDate = dateNDaysAgo(daysBack);
  const endDate = todayLocal();

  process.stderr.write(`Fetching ${daysBack} days of data for recovery analysis...\n`);

  const data = await fetchAllData(startDate, endDate);

  // Filter workouts by activity if specified
  let workouts = data.workout.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''));
  if (activityFilter) {
    workouts = workouts.filter(w =>
      (w.activity ?? '').toLowerCase().includes(activityFilter.toLowerCase()) ||
      (w.label ?? '').toLowerCase().includes(activityFilter.toLowerCase())
    );
  }

  if (workouts.length === 0) {
    const msg = activityFilter
      ? `No ${activityFilter} workouts found in the last ${daysBack} days.`
      : `No workouts found in the last ${daysBack} days.`;
    process.stdout.write(JSON.stringify({ error: msg }, null, 2) + '\n');
    process.exit(0);
  }

  // Build lookup indices
  const sleepMap = indexSleepByDay(data.sleep);
  const readinessMap = indexByDay(data.readiness);
  const hrMap = aggregateHeartRateByDay(data.heartrate);

  // Build recovery curves for each workout
  const recoveryResults = [];
  for (const workout of workouts) {
    const curve = buildRecoveryCurve(workout, sleepMap, readinessMap, hrMap);
    if (curve) recoveryResults.push(curve);
  }

  // Mark interrupted recovery windows
  markInterruptions(recoveryResults);

  // Fill pre-workout state
  fillPreWorkoutState(recoveryResults, sleepMap, readinessMap, data.stress, workouts);

  // Build regression model
  const model = buildRegressionModel(recoveryResults);

  // Generate insights
  const { insights, warnings } = generateInsights(recoveryResults, model);

  // Compute summary
  const summary = computeSummary(recoveryResults);

  // Prediction (if requested)
  let prediction = null;
  if (predictMode && model.available) {
    // Get current state from most recent readiness/sleep data
    const recentDays = Array.from({ length: 3 }, (_, i) => addDays(todayLocal(), -i));
    let currentReadiness = null;
    let currentHrv = null;

    for (const day of recentDays) {
      if (currentReadiness === null) {
        const r = readinessMap.get(day);
        if (r?.score != null) currentReadiness = r.score;
      }
      if (currentHrv === null) {
        const s = sleepMap.get(day);
        if (s?.average_hrv != null) currentHrv = s.average_hrv;
      }
    }

    if (currentReadiness !== null && currentHrv !== null) {
      prediction = predictRecoveryCost(
        model, recoveryResults, currentReadiness, currentHrv,
        predictDuration, predictIntensity
      );
    } else {
      prediction = { error: 'Could not determine current readiness/HRV state for prediction. Sync your ring.' };
    }
  } else if (predictMode && !model.available) {
    prediction = { error: model.reason };
  }

  // Output
  const output = {
    mode: 'recovery',
    date_range: { start: startDate, end: endDate },
    activity_filter: activityFilter,
    summary,
    model,
    prediction,
    insights,
    warnings,
    workouts: recoveryResults,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(0);

} catch (err) {
  process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + '\n');
  process.exit(1);
}
