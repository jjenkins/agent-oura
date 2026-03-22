# Phase 3: Queries and Extended Data - Research

**Researched:** 2026-03-22
**Domain:** Oura API v2 multi-endpoint query, statistical summary, Pearson correlation, SKILL.md routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Generic query script (`query.mjs`) that takes endpoint + date params as CLI args (e.g., `node query.mjs daily_sleep --start 2026-03-15 --end 2026-03-21`). Claude maps natural-language questions to the right endpoint and dates.
- **D-02:** Claude is the NLP layer -- no natural-language parsing in the script itself. Script takes explicit params, Claude figures out intent.
- **D-03:** No dedicated `/oura sleep`, `/oura activity` etc. commands -- Claude uses natural language routing to decide what to run. SKILL.md instructs Claude how to map questions to query.mjs calls.
- **D-04:** Claude can combine data from multiple endpoints in one answer by making multiple query.mjs calls or using multi-endpoint mode.
- **D-05:** Output format is JSON -- Claude parses and summarizes for the user. No plaintext formatting in the script.
- **D-06:** When a question is ambiguous (e.g., "how am I doing?"), Claude defaults to showing everything rather than asking for clarification.
- **D-07:** Default date range when unspecified is last 7 days.
- **D-08:** Maximum lookback is ~60 days (Oura API limit). When user asks beyond 60 days, Claude informs them rather than silently capping.
- **D-09:** "Today" queries route to the existing dashboard script. Query script is for multi-day ranges.
- **D-10:** Heart rate endpoint uses `start_datetime`/`end_datetime` (ISO 8601). The query script handles both parameter styles internally based on the endpoint.
- **D-11:** No separate scripts for workouts, sessions, SpO2, or heart rate. The generic `query.mjs` handles all endpoints. Claude interprets the JSON response fields.
- **D-12:** Existing `client.mjs` error handling (MEMBERSHIP_REQUIRED, etc.) covers extended data types -- no special handling needed.
- **D-13:** Workouts return all types in the date range. Claude filters by type in its summary if the user asks about a specific workout type. No `--type` filter in the script.
- **D-14:** The query script computes summary stats for trend queries: average, min, max, trend direction. Claude uses these computed stats rather than interpreting raw data points.
- **D-15:** Raw daily records are also included in the JSON output alongside the summary, so Claude can reference specific days as examples.
- **D-16:** Multi-endpoint mode or dedicated correlation tool -- the script fetches two endpoints for the same date range in a single invocation.
- **D-17:** Three-tier correlation architecture:
  1. Script computes Pearson correlation coefficient (r) -- deterministic math layer.
  2. Script translates r into semantic category in JSON: r >= 0.7 = "Strong Positive", 0.3 <= r < 0.7 = "Moderate Positive", -0.3 < r < 0.3 = "No Significant Correlation", -0.7 < r <= -0.3 = "Moderate Negative", r <= -0.7 = "Strong Negative".
  3. Claude receives semantic category + raw data, explains conversationally with 1-2 specific day examples.
- **D-18:** Time-shifted correlations (e.g., "does last night's sleep affect today's readiness?") handled by the script via an offset alignment mechanism. Script aligns metric A[day N] with metric B[day N+offset] before computing correlation.

### Claude's Discretion

- Exact CLI argument names and format for query.mjs
- How to structure the JSON output (flat vs nested)
- Which summary stats to include beyond avg/min/max
- How to present multi-endpoint results conversationally
- Correlation output JSON structure details
- Whether to include a `--offset` flag or infer offset from the endpoint pair

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NLQ-01 | User can ask natural-language questions about their Oura data | SKILL.md routing instructions tell Claude how to map questions to query.mjs calls with correct endpoint + date args |
| NLQ-02 | Skill routes questions to the correct API endpoint and date range | query.mjs accepts `--endpoint` and `--start`/`--end` args; Claude derives these from user question; date defaults (7 days) and max (60 days) are enforced in script |
| NLQ-03 | User can query trend analysis over configurable time periods | query.mjs returns summary stats (avg, min, max, trend direction) alongside raw records; script computes these, Claude narrates |
| NLQ-04 | User can ask correlation questions across multiple metrics | query.mjs in correlation mode fetches two endpoints, computes Pearson r, returns semantic category + aligned day pairs; Claude explains conversationally |
| DATA-01 | User can view workout summaries (type, duration, intensity) | `/usercollection/workout` endpoint; uses `start_date`/`end_date`; returns activity, calories, distance, intensity, start_datetime, end_datetime |
| DATA-02 | User can view session data (guided/unguided sessions) | `/usercollection/session` endpoint; uses `start_date`/`end_date`; returns type, mood, heart_rate, heart_rate_variability, motion_count |
| DATA-03 | User can view SpO2 (blood oxygen) data | `/usercollection/daily_spo2` endpoint; uses `start_date`/`end_date`; returns spo2_percentage.average, breathing_disturbance_index |
| DATA-04 | User can view heart rate data (5-minute intervals, ISO 8601 datetime params) | `/usercollection/heartrate` endpoint; uses `start_datetime`/`end_datetime`; returns bpm, source, timestamp per sample |
</phase_requirements>

---

## Summary

Phase 3 builds a single generic query script (`query.mjs`) that serves all natural-language Oura queries. The script is a "dumb pipe with math": it fetches one or two Oura endpoints for a date range, computes summary statistics (avg, min, max, trend direction), optionally computes Pearson correlation for cross-metric queries, and outputs JSON. Claude is the intelligence layer — it reads the JSON and answers the user in natural language.

The four extended data endpoints (workout, session, daily_spo2, heartrate) all work through the same query.mjs pattern. Three use `start_date`/`end_date` (date-only). Heart rate is the critical exception: it uses `start_datetime`/`end_datetime` (full ISO 8601). The query script must branch on endpoint name to build the correct param set. This is documented in existing PITFALLS.md as Pitfall 3 and is already a known concern on the project.

Pearson correlation can be implemented in ~15 lines of vanilla JavaScript with no external dependency. The formula is well-established, and the decision to use a semantic label layer (not expose r-values to the user) is architecturally sound: it prevents Claude from hallucinating correlation strength or inventing patterns. The offset alignment for time-shifted correlations (sleep[N] vs readiness[N+1]) is straightforward array slice logic.

**Primary recommendation:** Build query.mjs as a single script with three modes: (1) single-endpoint fetch+stats, (2) multi-endpoint parallel fetch+stats, (3) correlation mode that takes two endpoints and computes Pearson r with optional day offset. Use `ouraGetWithRetry` from `client.mjs` as the HTTP layer. Output JSON to stdout. Update SKILL.md with routing instructions telling Claude how to invoke all three modes.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | v22+ | HTTP (via `ouraGetWithRetry`) | Zero-dep; already in use |
| `client.mjs` (local) | Phase 1 | Authenticated Oura GET with retry | Established pattern; handles all error codes |

### No New npm Dependencies Required

The Pearson correlation coefficient implementation fits in ~15 lines of vanilla JS (see Code Examples below). There is no npm package worth adding for this: `calculate-correlation` and similar packages are trivial wrappers around the same math. Adding a dependency for a 15-line function is not justified.

Summary statistics (avg, min, max, trend direction) are standard `Array.reduce` operations with no library needed.

### Supporting Libraries Already Present

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `conf` | 15.x | Token storage | Installed Phase 1, not used directly in query.mjs |
| `chalk` | 5.x | Color output | Available if ever needed, but query.mjs outputs JSON (D-05) |

**Installation:** No new packages needed for Phase 3.

---

## Architecture Patterns

### Recommended Project Structure (additions for Phase 3)

```
.claude/skills/oura/
├── SKILL.md                     # MUST be updated with query routing section
└── scripts/
    ├── auth.mjs                 # Phase 1 (unchanged)
    ├── client.mjs               # Phase 1 (unchanged)
    ├── dashboard.mjs            # Phase 2 (unchanged)
    ├── profile.mjs              # Phase 2 (unchanged)
    └── query.mjs                # NEW: generic query + stats + correlation
```

No additional supporting files needed. SKILL.md is updated in-place with a new "Query Routing" section.

### Pattern 1: CLI Argument Interface for query.mjs

**What:** query.mjs accepts named CLI flags parsed manually (no external arg-parsing library needed at this scale).

**When to use:** All query invocations from SKILL.md.

**Modes:**
```
# Single-endpoint trend query
node query.mjs --endpoint daily_sleep --start 2026-03-15 --end 2026-03-21

# Multi-endpoint parallel fetch (Claude calls this for "how was my week?")
node query.mjs --endpoints daily_sleep,daily_readiness,daily_activity --start 2026-03-15 --end 2026-03-21

# Correlation mode (two endpoints, optional day offset)
node query.mjs --correlate daily_sleep,daily_readiness --start 2026-03-01 --end 2026-03-21 --offset 1
```

Flag naming is Claude's discretion (per CONTEXT.md). These names are proposed and the planner should finalize them. The key constraint is that SKILL.md instructions must exactly match the flag names implemented in the script.

### Pattern 2: Endpoint-Aware Parameter Builder

**What:** The heart rate endpoint requires `start_datetime`/`end_datetime`; all other endpoints use `start_date`/`end_date`. The script branches on endpoint name.

**When to use:** Every time query.mjs builds query params for an API call.

**Example:**
```javascript
// Source: verified against hedgertronic/oura-ring (MEDIUM) and Oura API docs (HIGH)
function buildParams(endpoint, startDate, endDate) {
  // Heart rate endpoint uses datetime params (ISO 8601), not date params.
  // startDate/endDate are YYYY-MM-DD strings; append T00:00:00 / T23:59:59.
  if (endpoint === 'heartrate') {
    return {
      start_datetime: `${startDate}T00:00:00`,
      end_datetime:   `${endDate}T23:59:59`,
    };
  }
  return { start_date: startDate, end_date: endDate };
}
```

### Pattern 3: Summary Stats Computation

**What:** After fetching daily records, compute avg/min/max/trend over the `score` field (or a configurable field for endpoints that lack a `score`).

**Field mapping by endpoint** (verified against pinta365/oura-api JSR docs, MEDIUM confidence):

| Endpoint | Primary Numeric Field | Notes |
|----------|-----------------------|-------|
| `daily_sleep` | `score` | 0-100 |
| `daily_readiness` | `score` | 0-100 |
| `daily_activity` | `score` | 0-100 |
| `daily_stress` | No numeric score | Use `day_summary` string; stats not meaningful |
| `daily_spo2` | `spo2_percentage.average` | Nested field |
| `heartrate` | `bpm` | Per-sample, not per-day; aggregate to daily avg before stats |
| `workout` | `calories`, `distance`, `intensity` | No single "score"; summarize per workout row |
| `session` | No score | Summarize by type count and mood distribution |

**Example:**
```javascript
// Compute summary stats over an array of records with a numeric field.
// Source: standard Array.reduce; no external library needed.
function computeStats(records, fieldFn) {
  const values = records.map(fieldFn).filter(v => v !== null && v !== undefined);
  if (values.length === 0) return { avg: null, min: null, max: null, trend: null };

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Trend: compare second-half average to first-half average.
  // Positive = improving, negative = declining, near-zero = stable.
  const mid = Math.floor(values.length / 2);
  const firstHalfAvg = values.slice(0, mid).reduce((a, b) => a + b, 0) / (mid || 1);
  const secondHalfAvg = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid || 1);
  const trend = secondHalfAvg - firstHalfAvg > 2 ? 'improving'
              : secondHalfAvg - firstHalfAvg < -2 ? 'declining'
              : 'stable';

  return { avg: Math.round(avg * 10) / 10, min, max, trend };
}
```

### Pattern 4: Pearson Correlation with Semantic Bridge

**What:** Compute r between two aligned arrays of daily values. Translate r to a semantic string. Include both in JSON output.

**When to use:** Any invocation in correlation mode (`--correlate`).

**Offset alignment:** When `--offset 1` is passed, align metricA[i] with metricB[i+1] — "did yesterday's sleep affect today's readiness?" This reduces the sample size by offset days.

**Example:**
```javascript
// Pearson correlation — vanilla JS, no dependencies.
// Source: standard formula; verified against multiple references including
// Gagniuc/Pearson-correlation-coefficient GitHub repo and MDN Math references.
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null; // insufficient data for meaningful correlation

  const meanX = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num  += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return null; // no variance — correlation undefined
  return num / denom;
}

// Semantic bridge — converts r to category string per D-17.
function correlationCategory(r) {
  if (r === null)  return 'Insufficient Data';
  if (r >= 0.7)    return 'Strong Positive';
  if (r >= 0.3)    return 'Moderate Positive';
  if (r > -0.3)    return 'No Significant Correlation';
  if (r > -0.7)    return 'Moderate Negative';
  return 'Strong Negative';
}
```

### Pattern 5: JSON Output Shape

**What:** query.mjs always writes JSON to stdout. Claude reads and interprets.

**Proposed shape for single-endpoint mode:**
```json
{
  "endpoint": "daily_sleep",
  "start_date": "2026-03-15",
  "end_date": "2026-03-21",
  "summary": {
    "avg": 82.4,
    "min": 71,
    "max": 91,
    "trend": "improving"
  },
  "records": [
    { "day": "2026-03-15", "score": 71 },
    { "day": "2026-03-16", "score": 78 }
  ]
}
```

**Proposed shape for correlation mode:**
```json
{
  "mode": "correlation",
  "endpoint_a": "daily_sleep",
  "endpoint_b": "daily_readiness",
  "offset_days": 1,
  "start_date": "2026-03-01",
  "end_date": "2026-03-21",
  "correlation": {
    "r": 0.54,
    "category": "Moderate Positive",
    "sample_size": 20
  },
  "aligned_pairs": [
    { "day_a": "2026-03-01", "value_a": 78, "day_b": "2026-03-02", "value_b": 82 }
  ]
}
```

The exact shape is Claude's discretion (per CONTEXT.md). The above is a recommendation for the planner to adopt or adjust.

### Anti-Patterns to Avoid

- **Using `Promise.all` instead of `Promise.allSettled` for multi-endpoint mode:** If one endpoint fails (e.g., membership required), `Promise.all` aborts all fetches. Use `Promise.allSettled` and include per-endpoint error info in the JSON output, same as dashboard.mjs does.
- **Aggregating heart rate to per-minute rows in the output:** Heart rate returns one record per sample (every 5 minutes or less over a date range). A 7-day query can produce thousands of rows. Aggregate to daily min/avg/max before including in the output; do not pass raw samples to Claude.
- **Calling `ouraGet` directly in query.mjs instead of `ouraGetWithRetry`:** For a single-endpoint invocation with no section-collapse logic needed, `ouraGetWithRetry` is the right choice. It handles rate limiting and token refresh automatically.
- **Building a custom arg parser:** A simple `process.argv` scan with `indexOf` or a Map is sufficient. No `minimist`, `yargs`, or `commander` needed for 4-5 flags.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated HTTP with retry | Custom fetch wrapper | `ouraGetWithRetry` from `client.mjs` | Already handles rate limit, auth expiry, membership, all error codes |
| Pearson correlation | External npm package | Inline ~15-line vanilla function | The formula is trivial; adding a dep for it adds install surface with zero benefit |
| Date default/range logic | Complex date library | `new Date()` + `toLocaleDateString('en-CA')` + date arithmetic | Established pattern from dashboard.mjs; no `dayjs`/`date-fns` needed |
| CLI argument parsing | `yargs`, `commander`, `minimist` | Manual `process.argv` scan | Overkill for 4-5 named flags; adds a dependency to a trivial problem |

**Key insight:** This script is a "dumb pipe with math." Every complex concern is either already solved by `client.mjs` (HTTP layer) or is genuinely simple math. The temptation to reach for npm packages should be resisted.

---

## Oura API Endpoint Reference

### Verified Endpoint Paths and Parameter Types

| Endpoint Name | URL Path | Date Params | Key Response Fields |
|---------------|----------|-------------|---------------------|
| `daily_sleep` | `/usercollection/daily_sleep` | `start_date`, `end_date` (YYYY-MM-DD) | `score`, `day`, `contributors{}` |
| `daily_readiness` | `/usercollection/daily_readiness` | `start_date`, `end_date` (YYYY-MM-DD) | `score`, `day`, `contributors{}`, `temperature_deviation` |
| `daily_activity` | `/usercollection/daily_activity` | `start_date`, `end_date` (YYYY-MM-DD) | `score`, `day`, `active_calories`, `steps` |
| `daily_stress` | `/usercollection/daily_stress` | `start_date`, `end_date` (YYYY-MM-DD) | `day_summary` (string, no numeric score) |
| `daily_spo2` | `/usercollection/daily_spo2` | `start_date`, `end_date` (YYYY-MM-DD) | `spo2_percentage.average`, `breathing_disturbance_index` |
| `workout` | `/usercollection/workout` | `start_date`, `end_date` (YYYY-MM-DD) | `activity`, `calories`, `distance`, `intensity`, `start_datetime`, `end_datetime`, `source` |
| `session` | `/usercollection/session` | `start_date`, `end_date` (YYYY-MM-DD) | `type`, `mood`, `heart_rate{}`, `heart_rate_variability{}`, `motion_count{}` |
| `heartrate` | `/usercollection/heartrate` | `start_datetime`, `end_datetime` (ISO 8601) | `bpm`, `source`, `timestamp` (per sample) |

**Confidence:** MEDIUM-HIGH — URL paths and parameter types confirmed against hedgertronic/oura-ring Python client and pinta365/oura-api JSR docs. Official Oura docs at cloud.ouraring.com/v2/docs were not directly fetchable (rendered as CSS-only). Field names confirmed against pinta365 TypeScript interfaces.

### Workout `intensity` Values

`"easy"` | `"moderate"` | `"hard"` — these are the three defined enum values.

### Workout `source` Values

`"manual"` | `"autodetected"` | `"confirmed"` | `"workout_heart_rate"`

### Session `type` Values

`"breathing"` | `"meditation"` | `"nap"` | `"relaxation"` | `"rest"` | `"body_status"`

### Session `mood` Values

`"bad"` | `"worse"` | `"same"` | `"good"` | `"great"`

### Heart Rate `source` Values

`"awake"` | `"rest"` | `"sleep"` | `"session"` | `"live"` | `"workout"`

---

## SKILL.md Update Pattern

Phase 3 must extend SKILL.md with a "Query Routing" section. The section should tell Claude:

1. How to determine whether a question is a "today" query (route to dashboard.mjs) vs. a multi-day range query (route to query.mjs).
2. The exact command syntax for query.mjs modes (single, multi, correlate).
3. The endpoint name to use for each data type (e.g., "sleep" -> `daily_sleep`, "blood oxygen" -> `daily_spo2`).
4. How to derive date ranges from natural language ("this week" -> last 7 days, "this month" -> last 30 days, "last 3 months" -> 90 days but warn user it exceeds 60-day limit).
5. How to interpret correlation output: "The system has determined there is a [category] correlation. Explain this relationship in a helpful, conversational way, pointing out 1-2 specific days from the aligned_pairs as examples."
6. Default behavior for ambiguous questions: show everything (D-06), i.e., call multi-endpoint mode with `daily_sleep,daily_readiness,daily_activity,daily_stress`.

The SKILL.md section should be concise — keep total SKILL.md under 400 lines (established anti-pattern from ARCHITECTURE.md).

---

## Common Pitfalls

### Pitfall 1: Heart Rate Datetime Boundary in User's Timezone

**What goes wrong:** `start_datetime` defaults to midnight UTC. A user in UTC-8 asking "how was my heart rate last night?" may get data from the wrong calendar day.

**Why it happens:** The established `toLocaleDateString('en-CA')` pattern gives the local date, but when constructing datetime strings, appending `T00:00:00` without a timezone offset produces a server-interpreted UTC time.

**How to avoid:** Use `T00:00:00` for start and `T23:59:59` for end without a timezone suffix. The Oura documentation notes "Time zone is also supported" and "time is optional, will default to 00:00:00" — the server interprets bare datetimes in the user's registered timezone. This is consistent with how the existing date handling works for other endpoints.

**Warning signs:** Heart rate data that consistently shows the wrong day or is shifted by 8+ hours.

### Pitfall 2: Pagination for Long Date Ranges

**What goes wrong:** query.mjs fetches a 30-day workout history. The API returns `next_token` in the response but the script only uses the first page. User sees partial data silently.

**Why it happens:** The dashboard.mjs pattern doesn't need pagination (single-day queries never paginate). query.mjs opens up multi-day ranges where pagination is triggered.

**How to avoid:** After each fetch, check if `json.next_token` is present. If so, make additional requests appending `next_token` as a query parameter until it is absent. Accumulate all pages into a single `data` array before computing stats.

**Warning signs:** Trend queries over 30+ days returning suspiciously few records; correlation sample sizes lower than expected.

### Pitfall 3: Heart Rate Volume for Multi-Day Queries

**What goes wrong:** A 7-day heart rate query returns thousands of per-sample rows (one every 5 minutes while awake/sleeping). Passing all of these in the JSON output to Claude consumes excessive context and is not useful at that granularity.

**Why it happens:** Heart rate is a high-frequency endpoint, unlike the daily summary endpoints.

**How to avoid:** In query.mjs, aggregate heart rate to daily buckets (min, max, avg bpm per day) before including in the output. Include source breakdown (sleep vs. awake vs. workout) as counts per day. Never emit raw per-sample rows to stdout.

**Warning signs:** Very large JSON output for heart rate queries; slow script execution; Claude context pressure warnings.

### Pitfall 4: Correlation with Insufficient Sample Size

**What goes wrong:** User asks "does my sleep affect my readiness?" over 5 days. Pearson r on 5 data points is statistically meaningless but the script returns a confident "Strong Positive" label.

**Why it happens:** The correlation function runs on whatever data it receives.

**How to avoid:** Gate correlation on minimum sample size. The `pearson()` function above already returns `null` for n < 3, but a higher threshold (n >= 7) is more meaningful. When sample size is low, include a warning in the JSON output (e.g., `"warning": "Only 5 days of data — correlation may not be statistically meaningful"`). Claude will relay this to the user.

**Warning signs:** Correlation queries over short date ranges returning strong-sounding categories.

### Pitfall 5: `daily_stress` Has No Numeric Score

**What goes wrong:** computeStats() is called on `daily_stress` records using `score` field, which is undefined. Stats come back as `{ avg: null, min: null, max: null }`. Claude receives an unhelpful empty summary.

**Why it happens:** All other daily endpoints have a `score` field. `daily_stress` uses `day_summary` (a string like "stressful" or "calm") with no numeric equivalent.

**How to avoid:** In computeStats field selection, explicitly handle `daily_stress` as a special case: return a value-count summary (how many days were "stressful" vs "calm") rather than numeric stats. This same pattern was encountered in dashboard.mjs (Phase 2 context).

**Warning signs:** Null stats for stress queries; Claude unable to summarize stress trends meaningfully.

---

## Code Examples

### Date Defaults and 60-Day Guard

```javascript
// Source: extends toLocaleDateString('en-CA') pattern from dashboard.mjs
function getDateRange(startArg, endArg) {
  const today = new Date();
  const end = endArg
    ? endArg
    : today.toLocaleDateString('en-CA');

  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 7);
  const start = startArg
    ? startArg
    : defaultStart.toLocaleDateString('en-CA');

  // Enforce 60-day maximum (D-08). Return a warning field if exceeded.
  const msPerDay = 86_400_000;
  const daysDiff = (new Date(end) - new Date(start)) / msPerDay;
  const warning = daysDiff > 60
    ? `Date range (${Math.round(daysDiff)} days) exceeds Oura API 60-day limit. Results may be incomplete.`
    : null;

  return { start, end, warning };
}
```

### Pagination Handler

```javascript
// Source: Oura API pagination pattern; verified from PITFALLS.md and hedgertronic client
async function fetchAllPages(endpoint, params) {
  let allRecords = [];
  let nextToken = undefined;

  do {
    const queryParams = { ...params };
    if (nextToken) queryParams.next_token = nextToken;

    const json = await ouraGetWithRetry(`/usercollection/${endpoint}`, queryParams);
    allRecords = allRecords.concat(json.data ?? []);
    nextToken = json.next_token ?? null;
  } while (nextToken);

  return allRecords;
}
```

### Heart Rate Daily Aggregation

```javascript
// Aggregate per-sample heart rate records into per-day buckets.
// Source: standard Map reduce; no library needed.
function aggregateHeartRateByDay(samples) {
  const byDay = new Map();

  for (const sample of samples) {
    const day = sample.timestamp.slice(0, 10); // YYYY-MM-DD from ISO string
    if (!byDay.has(day)) byDay.set(day, { bpms: [], sources: {} });
    const bucket = byDay.get(day);
    bucket.bpms.push(sample.bpm);
    bucket.sources[sample.source] = (bucket.sources[sample.source] ?? 0) + 1;
  }

  return Array.from(byDay.entries()).map(([day, bucket]) => ({
    day,
    bpm_avg: Math.round(bucket.bpms.reduce((a, b) => a + b, 0) / bucket.bpms.length),
    bpm_min: Math.min(...bucket.bpms),
    bpm_max: Math.max(...bucket.bpms),
    sample_count: bucket.bpms.length,
    sources: bucket.sources,
  }));
}
```

### Full query.mjs Structural Skeleton

```javascript
// .claude/skills/oura/scripts/query.mjs
// Generic Oura query: single endpoint, multi-endpoint, or correlation mode.

import { ouraGetWithRetry } from './client.mjs';

// --- Arg parsing ---
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}

const endpoint    = getArg('endpoint');    // single mode
const endpoints   = getArg('endpoints');   // multi mode (comma-separated)
const correlate   = getArg('correlate');   // correlation mode (comma-separated pair)
const startArg    = getArg('start');
const endArg      = getArg('end');
const offsetArg   = getArg('offset');      // correlation day offset (default: 0)

// --- Dispatch to mode ---
// (single / multi / correlation)
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Separate scripts per endpoint | Single generic query.mjs with endpoint arg (D-11) | Fewer files, consistent behavior, easier SKILL.md routing |
| Client-side NLP for query parsing | Claude as NLP layer; script takes explicit params (D-02) | Zero NLP library; Claude already understands natural language |
| Returning raw score arrays for trend | Script computes avg/min/max/trend, Claude narrates (D-14/D-15) | Claude gets actionable stats, not raw numbers to interpret |
| Separate correlation script | Correlation mode flag within query.mjs (D-16) | Single entry point; simpler SKILL.md instructions |

---

## Open Questions

1. **Session and workout data for correlation**
   - What we know: session and workout records don't have a single `score` field; they have typed sub-fields (intensity, mood, type counts).
   - What's unclear: If user asks "does my workout intensity correlate with my sleep?", what numeric value does the script extract for the workout side? Intensity is an enum ("easy", "moderate", "hard") — it would need to be mapped to a number (1/2/3) before Pearson is applicable.
   - Recommendation: For Phase 3, scope correlation to score-bearing endpoints (sleep, readiness, activity, spo2 average, daily heart rate average). If workout/session correlation is requested, Claude should inform the user that correlation analysis is available for sleep, readiness, activity, SpO2, and heart rate. This keeps the script simple and avoids enum-to-number heuristics.

2. **Multi-endpoint `next_token` when endpoints are fetched in parallel**
   - What we know: `Promise.allSettled` is used for parallel fetches. Each endpoint has its own `next_token` pagination.
   - What's unclear: Whether any endpoint will realistically paginate for the default 7-day range.
   - Recommendation: Implement pagination in `fetchAllPages()` but only apply it per-endpoint independently. In practice, 7 days of daily data will not paginate (< 10 records). Heart rate over 7 days might paginate. Test during implementation.

3. **SKILL.md length after Phase 3 additions**
   - What we know: Current SKILL.md is approximately 100 lines. The query routing section will add routing instructions for ~8 endpoints plus correlation and date range guidance.
   - What's unclear: How much context the routing instructions will require.
   - Recommendation: Keep the routing section under 100 additional lines. Move endpoint-to-field-name mapping reference to a separate `endpoints.md` file if SKILL.md approaches 400 lines. SKILL.md should say "see endpoints.md for field names" rather than listing them inline.

---

## Sources

### Primary (HIGH confidence)
- hedgertronic/oura-ring GitHub (oura_ring.py) — confirmed endpoint URL paths and date vs datetime param split for all four extended endpoints
- pinta365/oura-api JSR docs (jsr.io/@pinta365/oura-api/doc) — TypeScript interface field names for workout, session, daily_spo2, heartrate response shapes
- `.planning/research/PITFALLS.md` — Pitfall 3 (date vs datetime), Pitfall: pagination, performance traps for heart rate volume
- `.planning/research/ARCHITECTURE.md` — Script-mediated API access pattern, anti-pattern re SKILL.md length
- `.claude/skills/oura/scripts/client.mjs` — ouraGetWithRetry signature, error code taxonomy
- `.claude/skills/oura/scripts/dashboard.mjs` — Promise.allSettled pattern, toLocaleDateString('en-CA'), extractRecord

### Secondary (MEDIUM confidence)
- WebSearch: Pearson correlation JS implementations — confirmed formula and edge cases; vanilla implementation confirmed trivial
- arzzen/oura GitHub README — endpoint list confirming daily_spo2, session, workout, heartrate all present in v2

### Tertiary (LOW confidence)
- cloud.ouraring.com/v2/docs — attempted fetch returned CSS-only; content not available for direct verification. Endpoint details cross-verified via community implementations.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing patterns reused
- Endpoint paths and param types: MEDIUM-HIGH — verified via two community sources; official docs not directly accessible
- Architecture: HIGH — locked decisions from CONTEXT.md are clear and consistent with existing codebase patterns
- Pearson implementation: HIGH — standard formula with no ambiguity
- Pitfalls: HIGH — heart rate volume, pagination, and datetime pitfalls all confirmed by multiple sources and existing PITFALLS.md

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (Oura API v2 endpoints are stable; 30-day validity window)
