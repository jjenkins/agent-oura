# Phase 2: Daily Dashboard - Research

**Researched:** 2026-03-22
**Domain:** Oura API v2 daily endpoints, stdout-rendered health dashboard, SKILL.md command extension
**Confidence:** MEDIUM-HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dashboard structure:**
- D-01: Sectioned layout — each score (readiness, sleep, activity, stress) gets its own section
- D-02: Equal structural treatment across all four sections (same heading style, same layout)
- D-03: Each section shows score + 2-3 key supporting metrics — keep sections tight
- D-04: Stress section may be shorter than others if the API returns fewer fields — be honest about the data, no padding

**Contributors display:**
- D-05: Show ALL contributors for readiness and sleep (not just top N)
- D-06: Sort contributors by impact, worst-to-best — problem areas surface first
- D-07: Claude interprets contributor names naturally in conversation (not hardcoded human-readable labels)
- D-08: Activity and stress sections silently omit contributors — no "not available" notice

**Missing data / sync handling:**
- D-09: Show today's data for whatever scores have synced; collapse sections that haven't synced yet
- D-10: Collapsed sections are omitted entirely, not shown as empty placeholders
- D-11: If NOTHING has synced today, show a short notice ("Today's data hasn't synced yet") — no fallback to yesterday's data

**Personal info command:**
- D-12: Separate `/oura profile` command for personal info + ring configuration — not part of the daily dashboard
- D-13: Show everything the API returns (age, weight, height, biological sex, email, ring color, design, firmware, hardware type, setup date)
- D-14: Include available connectivity info alongside profile data (ring hardware type, firmware version, setup date)
- D-15: `/oura status` (Phase 1 auth check) stays separate from `/oura profile`

### Claude's Discretion

- Exact key metrics chosen for each section's 2-3 supporting values
- Section ordering (readiness first vs sleep first, etc.)
- Formatting of score values (plain numbers, color descriptors, etc.)
- How Claude phrases the "not synced" notice
- Layout of `/oura profile` output

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | User can invoke skill and see today's readiness, sleep, activity, and stress scores | Four endpoints documented: `/usercollection/daily_readiness`, `/usercollection/daily_sleep`, `/usercollection/daily_activity`, `/usercollection/daily_stress`; all called in parallel via `Promise.all()` in `dashboard.mjs` |
| DASH-02 | Dashboard shows top contributors for readiness and sleep scores | `ReadinessContributors` (9 fields) and `SleepContributors` (7 fields) documented; sort by value ascending (worst first) per D-06 |
| DASH-03 | Dashboard gracefully handles missing data when today's scores haven't synced | `DATA_NOT_SYNCED` error already thrown by `ouraGet` when `data: []` is returned; dashboard script catches per-endpoint, omits uncollected sections (D-10), shows global notice only when all sections empty (D-11) |
| DATA-05 | User can view ring configuration and personal profile info | Two endpoints: `/usercollection/personal_info` (age, weight, height, biological_sex, email) and `/usercollection/ring_configuration` (color, design, firmware_version, hardware_type, set_up_at, size); combined into `/oura profile` command |
</phase_requirements>

---

## Summary

Phase 2 builds two new scripts and extends SKILL.md. The daily dashboard script (`dashboard.mjs`) fetches from four Oura API v2 endpoints in parallel, catches `DATA_NOT_SYNCED` per section, and outputs structured text that Claude renders as a health briefing. The profile script (`profile.mjs`) fetches personal info and ring configuration and outputs a combined summary. Both scripts import `ouraGetWithRetry` from the already-built `client.mjs`.

The key complexity in this phase is the per-section sync-state handling: each of the four score sections can independently be missing, requiring the script to track which sections resolved and which threw `DATA_NOT_SYNCED`. The contributor sort (worst-to-best) is a simple descending sort on the numeric contributor values before output.

**Primary recommendation:** Build `dashboard.mjs` and `profile.mjs` as standalone `.mjs` scripts that import from `client.mjs`. Output structured plaintext (not JSON) directly from the scripts so Claude reads the formatted text and presents it. Extend SKILL.md with `/oura` (dashboard) and `/oura profile` commands.

---

## Standard Stack

### Core (already installed — Phase 1)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Node.js built-in `fetch` | v22+ | HTTP calls via `ouraGetWithRetry` | In use via `client.mjs` |
| `client.mjs` | local | `ouraGetWithRetry`, `formatError` | Implemented Phase 1 |
| `auth.mjs` | local | `readTokens` | Implemented Phase 1 |

### New for Phase 2

No new npm packages needed. The dashboard is text-formatted stdout output. `chalk` and `cli-table3` were listed in STACK.md research as optional for dashboards, but given that Claude reads stdout and presents it to the user with its own formatting capabilities, plain structured text is simpler and equally readable.

**Decision:** Do not install `chalk` or `cli-table3` for Phase 2. Output plain structured text with section headers and indented metrics. Claude's rendering handles visual presentation. Adding ANSI codes risks terminal escape sequences appearing raw in Claude's context.

If color is desired in a future phase when scripts are invoked directly by users outside of Claude, `chalk` can be added then.

**Installation:** No new packages. Use existing `node_modules` in `scripts/`.

---

## Architecture Patterns

### Recommended Script Structure

```
.claude/skills/oura/scripts/
├── auth.mjs          # Phase 1 — readTokens, initAuth, showStatus
├── client.mjs        # Phase 1 — ouraGetWithRetry, ouraGet, formatError
├── dashboard.mjs     # Phase 2 (NEW) — fetches 4 endpoints, formats dashboard
├── profile.mjs       # Phase 2 (NEW) — fetches personal_info + ring_configuration
├── package.json      # existing
└── node_modules/     # existing
```

### Pattern 1: Parallel Fetch with Per-Section Error Handling

**What:** Fetch all four daily endpoints simultaneously. Use `Promise.allSettled()` rather than `Promise.all()` so that one endpoint failing (DATA_NOT_SYNCED or other error) does not abort the others.

**When to use:** Dashboard invocation — all four sections are independent data sources.

**Why `allSettled` not `all`:** D-09 requires showing whatever sections have synced. If sleep data is ready but readiness isn't, the dashboard should show sleep and omit readiness. `Promise.all()` would reject the entire batch on any error.

```javascript
// Source: MDN Promise.allSettled docs + D-09 decision
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD, local time

const [readiness, sleep, activity, stress] = await Promise.allSettled([
  ouraGetWithRetry('/usercollection/daily_readiness', { start_date: today, end_date: today }),
  ouraGetWithRetry('/usercollection/daily_sleep',     { start_date: today, end_date: today }),
  ouraGetWithRetry('/usercollection/daily_activity',  { start_date: today, end_date: today }),
  ouraGetWithRetry('/usercollection/daily_stress',    { start_date: today, end_date: today }),
]);
```

**CRITICAL NOTE:** `ouraGetWithRetry` already throws a transformed Error with the human-readable message for `DATA_NOT_SYNCED`. The dashboard script must check `err.message` carefully — it will be the *formatted* message string, not the raw `DATA_NOT_SYNCED` code, because `ouraGetWithRetry` wraps it. See the client.mjs code: a `DATA_NOT_SYNCED` throw from `ouraGet` reaches `ouraGetWithRetry`'s catch block and is re-thrown as `'Data not yet synced. Check the Oura app and try again in a few minutes.'`.

To distinguish DATA_NOT_SYNCED from a hard error, check whether the settled promise's rejection message includes "not yet synced" OR add a dedicated check. The cleanest fix is to call `ouraGet` directly (not `ouraGetWithRetry`) for each parallel fetch, catching `DATA_NOT_SYNCED` at the section level. This avoids the retry wrapper interfering with the per-section collapse logic.

**Recommended approach:** Call `ouraGet` directly (not `ouraGetWithRetry`) in `Promise.allSettled()`. Handle `DATA_NOT_SYNCED`, `RATE_LIMITED`, and other errors at the section level. This gives the script full control over the per-section behavior.

### Pattern 2: Today's Date in Local Timezone

**What:** Always derive today's date string in the user's local timezone, not UTC.

**Why:** A user in UTC-8 running the skill at 11pm UTC (3pm local) would get tomorrow's date if UTC is used. Oura's API uses local date semantics — the ring knows what "today" means in the user's time zone.

```javascript
// Correct: local date
const today = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD' format via ISO-8601 locale

// Wrong: UTC date (may be tomorrow or yesterday depending on timezone offset)
const today = new Date().toISOString().split('T')[0];
```

**Note:** `en-CA` locale produces `YYYY-MM-DD` format reliably across Node.js versions.

### Pattern 3: Contributor Sort (Worst-to-Best)

**What:** Sort readiness and sleep contributors by their numeric value ascending so lowest scores appear first.

**Why:** D-06 requires problem areas surface first. A contributor score of 15 means that factor is dragging the score down — it should appear at the top of the list.

```javascript
// Contributors are objects like { activity_balance: 72, hrv_balance: 45, ... }
// Sort entries by value ascending (worst = lowest score = first)
function sortedContributors(contributors) {
  return Object.entries(contributors)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort(([, a], [, b]) => a - b); // ascending: lowest (worst) first
}
```

### Pattern 4: Section Output Format

**What:** Each section emits labeled text that Claude can read and present. No ANSI codes.

**Structure for dashboard output:**

```
=== Daily Health Dashboard ===
Date: 2026-03-22

--- Readiness: 78 ---
  activity_balance: 62
  hrv_balance: 68
  previous_night: 71
  resting_heart_rate: 79
  sleep_balance: 80
  recovery_index: 84
  body_temperature: 87
  sleep_regularity: 90
  previous_day_activity: 91
  temperature_deviation: -0.12°C

--- Sleep: 85 ---
  latency: 60
  restfulness: 70
  timing: 75
  rem_sleep: 80
  deep_sleep: 85
  efficiency: 90
  total_sleep: 92

--- Activity: 72 ---
  score: 72
  active_calories: 380
  steps: 5100

--- Stress: restored ---
  stress_high: 1800s
  recovery_high: 3600s
```

**Note on stress:** The `daily_stress` endpoint does not return a numeric score 0-100 like the other three. It returns `stress_high` (seconds), `recovery_high` (seconds), and `day_summary` (enum). The section heading should use `day_summary` as the summary value rather than "score". If `day_summary` is null, omit it.

### Pattern 5: Profile Script Output

```
=== Oura Profile ===

Personal Info:
  Email: user@example.com
  Age: 34
  Height: 175 cm
  Weight: 72 kg
  Biological sex: male

Ring Configuration:
  Hardware: gen2
  Color: brushed_silver
  Design: balance
  Firmware: 2.8.14
  Size: 9
  Setup date: 2023-07-15
```

### Anti-Patterns to Avoid

- **Calling `Promise.all()` instead of `Promise.allSettled()`:** `Promise.all()` will reject the whole batch if any one endpoint returns no data, violating D-09.
- **Using UTC date for `today`:** Oura data is keyed to local date; UTC date can be off by one day for users in non-zero UTC offsets.
- **Showing empty placeholder sections:** D-10 requires collapsed sections are omitted entirely. Do not output `--- Readiness: N/A ---`.
- **Treating `DATA_NOT_SYNCED` as a hard error:** It is the expected state when the ring hasn't synced yet, not a script failure.
- **Installing chalk or cli-table3 for this phase:** ANSI codes may render as raw escape sequences in Claude's context. Plain text is the correct output mode for skill scripts.
- **Hardcoding contributor label strings:** D-07 says Claude interprets contributor names naturally. Output the raw API key names (`hrv_balance`) and let Claude render them as "HRV balance" in its response.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated API calls | Custom fetch wrapper with auth | `ouraGetWithRetry` from `client.mjs` | Already handles retry, rate limiting, auth refresh, error classification |
| Token management | Any token logic | `readTokens` from `auth.mjs` | Already handles read, expiry check, atomic refresh |
| Parallel fetch with per-item error isolation | Manual promise chaining | `Promise.allSettled()` built-in | Exactly what `allSettled` is designed for |
| Date formatting to YYYY-MM-DD | String manipulation | `toLocaleDateString('en-CA')` built-in | One-liner, handles timezone correctly |

**Key insight:** The Phase 1 infrastructure handles all auth and HTTP concerns. Phase 2 scripts are pure data-fetch-and-format with minimal logic.

---

## Oura API Endpoint Reference

### Endpoints Used in This Phase

| Endpoint path | Parameters | Returns |
|--------------|-----------|---------|
| `GET /v2/usercollection/daily_readiness` | `start_date`, `end_date` (YYYY-MM-DD) | `{ data: [DailyReadiness], next_token }` |
| `GET /v2/usercollection/daily_sleep` | `start_date`, `end_date` (YYYY-MM-DD) | `{ data: [DailySleep], next_token }` |
| `GET /v2/usercollection/daily_activity` | `start_date`, `end_date` (YYYY-MM-DD) | `{ data: [DailyActivity], next_token }` |
| `GET /v2/usercollection/daily_stress` | `start_date`, `end_date` (YYYY-MM-DD) | `{ data: [DailyStress], next_token }` |
| `GET /v2/usercollection/personal_info` | none | PersonalInfo object (not wrapped in `data:`) |
| `GET /v2/usercollection/ring_configuration` | `start_date`, `end_date` (YYYY-MM-DD, optional) | `{ data: [RingConfiguration], next_token }` |

### Response Schemas

**DailyReadiness** (confidence: HIGH via JSR type library + official search results)
```
{
  id: string,
  day: "YYYY-MM-DD",
  score: number | null,          // 0-100; null if insufficient data
  temperature_deviation: number | null,    // degrees C
  temperature_trend_deviation: number | null,
  timestamp: string,
  contributors: {
    activity_balance: number | null,      // 1-100
    body_temperature: number | null,      // 1-100
    hrv_balance: number | null,           // 1-100
    previous_day_activity: number | null, // 1-100
    previous_night: number | null,        // 1-100
    recovery_index: number | null,        // 1-100
    resting_heart_rate: number | null,    // 1-100
    sleep_balance: number | null,         // 1-100
    sleep_regularity: number | null       // 1-100
  }
}
```

**DailySleep** (confidence: HIGH via JSR type library)
```
{
  id: string,
  day: "YYYY-MM-DD",
  score: number | null,
  timestamp: string,
  contributors: {
    deep_sleep: number | null,    // 1-100
    efficiency: number | null,    // 1-100
    latency: number | null,       // 1-100
    rem_sleep: number | null,     // 1-100
    restfulness: number | null,   // 1-100
    timing: number | null,        // 1-100
    total_sleep: number | null    // 1-100
  }
}
```

**DailyActivity** (confidence: MEDIUM via JSR type library + search)
```
{
  id: string,
  day: "YYYY-MM-DD",
  score: number | null,
  active_calories: number,
  steps: number,
  equivalent_walking_distance: number,   // meters
  high_activity_time: number,            // seconds
  medium_activity_time: number,          // seconds
  low_activity_time: number,             // seconds
  sedentary_time: number,                // seconds
  timestamp: string,
  contributors: {
    meet_daily_targets: number | null,
    move_every_hour: number | null,
    recovery_time: number | null,
    stay_active: number | null,
    training_frequency: number | null,
    training_volume: number | null
  }
}
```

**DailyStress** (confidence: MEDIUM via multiple search results)
```
{
  id: string,
  day: "YYYY-MM-DD",
  stress_high: number | null,     // seconds in high stress zone
  recovery_high: number | null,   // seconds in high recovery zone
  day_summary: "restored" | "normal" | "stressful" | null
  // "overwhelmed" may also exist — treat any unknown value as pass-through
}
```

**PersonalInfo** (confidence: HIGH via official docs + JSR)
```
{
  id: string,
  age: number | null,
  weight: number | null,         // kg
  height: number | null,         // cm
  biological_sex: string | null, // "male" | "female" | null
  email: string | null
}
```
Note: `personal_info` returns a direct object (not `{ data: [...] }`). The `ouraGet` check for `Array.isArray(json.data) && json.data.length === 0` correctly passes this through without throwing `DATA_NOT_SYNCED`.

**RingConfiguration** (confidence: HIGH via official developer docs search)
```
{
  id: string,
  color: string,           // e.g., "brushed_silver"
  design: string,          // e.g., "balance"
  firmware_version: string,
  hardware_type: string,   // e.g., "gen1", "gen2", "gen3"
  set_up_at: string,       // UTC timestamp
  size: number             // US ring size integer
}
```
Note: `ring_configuration` returns `{ data: [...] }` like other collection endpoints. Use the most recent record (last item in `data` array, sorted by `set_up_at`).

---

## SKILL.md Extension Plan

The existing SKILL.md must be extended with two new commands. The current file ends after `/oura status`.

**New `/oura` command (dashboard):**
```
### /oura

Run the daily dashboard script:

```bash
cd {project_root}/.claude/skills/oura/scripts && node dashboard.mjs
```

Parse the output sections:
- Each `--- Section: value ---` line is a score section header
- Indented lines below are key: value metrics
- If output contains "Today's data hasn't synced yet", show that message and stop
- Present each section as a titled block with the score prominently displayed
- For readiness and sleep, list contributors with their values; interpret the raw key names
  as human-readable labels (e.g., `hrv_balance` → "HRV balance", `deep_sleep` → "Deep sleep")
- For activity and stress, show only the summary metrics (no contributors)
```

**New `/oura profile` command:**
```
### /oura profile

Run the profile script to show personal info and ring configuration:

```bash
cd {project_root}/.claude/skills/oura/scripts && node profile.mjs
```

Present the personal info (age, weight, height, biological sex, email) and ring details
(hardware type, color, design, firmware version, size, setup date) in a readable format.
```

---

## Common Pitfalls

### Pitfall 1: Using `ouraGetWithRetry` instead of `ouraGet` in `Promise.allSettled()`

**What goes wrong:** `ouraGetWithRetry` converts `DATA_NOT_SYNCED` into a human-readable string error. When caught in `allSettled`, the error message `'Data not yet synced...'` must be string-matched to distinguish it from real API errors. This is fragile.

**How to avoid:** Import `ouraGet` directly from `client.mjs` for the parallel dashboard fetches. Handle `DATA_NOT_SYNCED` by checking `err.message === 'DATA_NOT_SYNCED'` at the section level.

**Warning sign:** Code that `catch(err)` and checks `err.message.includes('not yet synced')` string-matching against a user-facing message.

### Pitfall 2: UTC date causing off-by-one errors

**What goes wrong:** `new Date().toISOString().split('T')[0]` returns the UTC date. For users west of UTC (most of North America), this is tomorrow's date until midnight UTC — meaning the skill queries data for tomorrow and gets an empty response at 8pm local time.

**How to avoid:** Use `new Date().toLocaleDateString('en-CA')` which uses the system's local timezone.

**Warning sign:** `today` derived from `.toISOString()` anywhere in date-related code.

### Pitfall 3: Stress endpoint returns no numeric score

**What goes wrong:** The dashboard script treats `daily_stress` the same as the other three endpoints and tries to display `record.score`, which is `undefined` for stress. The section header shows `--- Stress: undefined ---`.

**How to avoid:** The stress endpoint returns `day_summary` (string enum), `stress_high` (seconds), and `recovery_high` (seconds). There is no `score` field. Handle stress as a special case: use `day_summary` as the section summary value.

**Warning sign:** `record.score` used for the stress section header.

### Pitfall 4: `ring_configuration` using wrong data extraction

**What goes wrong:** `ring_configuration` returns `{ data: [record1, record2] }` — a user may have set up multiple rings or the same ring multiple times. Taking `data[0]` might give an old configuration.

**How to avoid:** Sort by `set_up_at` and take the last record, or take `data[data.length - 1]` as the most recent.

### Pitfall 5: Score can be null even when data is present

**What goes wrong:** The daily score endpoints return `{ data: [{ score: null, contributors: {...} }] }` in some edge cases (e.g., insufficient sleep data to compute readiness). This is NOT `DATA_NOT_SYNCED` — data exists, but the score hasn't been computed. `ouraGet` won't throw because `data` is non-empty.

**How to avoid:** Check `record.score !== null` before displaying the score. Show "Score pending" or similar if score is null but data is present.

### Pitfall 6: `DATA_NOT_SYNCED` detection is `data: []` only

**What goes wrong:** The existing `ouraGet` throws `DATA_NOT_SYNCED` when `json.data` is an empty array. This correctly handles the sync-not-ready case. But dashboard scripts that call `ouraGet` directly must also handle the case where `json.data` exists and has one record but `record.score` is null.

**How to avoid:** Two-level check: (1) `DATA_NOT_SYNCED` from ouraGet means no data at all; (2) `record.score === null` means data present but score not yet calculated. Treat both as "not ready" for the dashboard section collapse.

---

## Code Examples

### dashboard.mjs Skeleton

```javascript
// Source: CONTEXT.md decisions + client.mjs patterns established in Phase 1
import { ouraGet, formatError } from './client.mjs';

const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone

const [readinessResult, sleepResult, activityResult, stressResult] = await Promise.allSettled([
  ouraGet('/usercollection/daily_readiness', { start_date: today, end_date: today }),
  ouraGet('/usercollection/daily_sleep',     { start_date: today, end_date: today }),
  ouraGet('/usercollection/daily_activity',  { start_date: today, end_date: today }),
  ouraGet('/usercollection/daily_stress',    { start_date: today, end_date: today }),
]);

function extractRecord(result) {
  if (result.status === 'rejected') return null;
  const data = result.value?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

const readiness = extractRecord(readinessResult);
const sleep     = extractRecord(sleepResult);
const activity  = extractRecord(activityResult);
const stress    = extractRecord(stressResult);

const anySynced = readiness || sleep || activity || stress;

if (!anySynced) {
  process.stdout.write("Today's data hasn't synced yet. Check your Oura app.\n");
  process.exit(0);
}

const lines = [`=== Daily Health Dashboard ===`, `Date: ${today}`, ''];

function sortedContributors(contributors) {
  if (!contributors) return [];
  return Object.entries(contributors)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort(([, a], [, b]) => a - b); // ascending: worst (lowest) first
}

if (readiness) {
  const score = readiness.score ?? 'pending';
  lines.push(`--- Readiness: ${score} ---`);
  for (const [key, val] of sortedContributors(readiness.contributors)) {
    lines.push(`  ${key}: ${val}`);
  }
  if (readiness.temperature_deviation !== null && readiness.temperature_deviation !== undefined) {
    lines.push(`  temperature_deviation: ${readiness.temperature_deviation}°C`);
  }
  lines.push('');
}

// ... similar blocks for sleep, activity, stress
```

### profile.mjs Skeleton

```javascript
// Source: CONTEXT.md D-12 through D-15
import { ouraGetWithRetry } from './client.mjs';

const [personalInfo, ringConfig] = await Promise.all([
  ouraGetWithRetry('/usercollection/personal_info'),
  ouraGetWithRetry('/usercollection/ring_configuration'),
]);

// personal_info is a direct object (no data: [] wrapper)
// ring_configuration returns { data: [...] } — take most recent
const ring = ringConfig.data?.sort(
  (a, b) => new Date(a.set_up_at) - new Date(b.set_up_at)
).at(-1);

const lines = ['=== Oura Profile ===', ''];
lines.push('Personal Info:');
if (personalInfo.email)         lines.push(`  Email: ${personalInfo.email}`);
if (personalInfo.age !== null)  lines.push(`  Age: ${personalInfo.age}`);
if (personalInfo.height)        lines.push(`  Height: ${personalInfo.height} cm`);
if (personalInfo.weight)        lines.push(`  Weight: ${personalInfo.weight} kg`);
if (personalInfo.biological_sex) lines.push(`  Biological sex: ${personalInfo.biological_sex}`);

if (ring) {
  lines.push('', 'Ring Configuration:');
  lines.push(`  Hardware: ${ring.hardware_type}`);
  lines.push(`  Color: ${ring.color}`);
  lines.push(`  Design: ${ring.design}`);
  lines.push(`  Firmware: ${ring.firmware_version}`);
  lines.push(`  Size: ${ring.size}`);
  if (ring.set_up_at) lines.push(`  Setup date: ${ring.set_up_at.split('T')[0]}`);
}

process.stdout.write(lines.join('\n') + '\n');
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `cli-table3` for dashboard tables | Plain structured text for Claude to read | Claude renders output — ANSI/table codes are unnecessary and may appear raw |
| Single `Promise.all()` for parallel calls | `Promise.allSettled()` for per-section error isolation | Required for D-09 collapsed sections on partial sync |
| Generic date via `toISOString()` | Local date via `toLocaleDateString('en-CA')` | Prevents off-by-one errors for non-UTC users |

---

## Open Questions

1. **Stress section: are there more `day_summary` enum values beyond restored/normal/stressful?**
   - What we know: Three values confirmed by multiple sources (restored, normal, stressful)
   - What's unclear: Whether "overwhelmed" or other values exist in the actual API
   - Recommendation: Output `day_summary` value as-is and let Claude interpret it; don't hardcode enum handling

2. **Can `daily_stress` be completely absent vs. returning `{ data: [] }` for users without stress tracking?**
   - What we know: `stress` scope requires active Oura membership; without it, the API may return 403
   - What's unclear: Whether the endpoint returns empty data or a 403 for free-tier users
   - Recommendation: Handle `MEMBERSHIP_REQUIRED` from stress endpoint gracefully; collapse the stress section (same as DATA_NOT_SYNCED behavior per D-09/D-10)

3. **`ring_configuration` endpoint — does it require date parameters for users with a single ring?**
   - What we know: Endpoint accepts optional `start_date`/`end_date`; omitting them should return all records
   - What's unclear: Whether omitting dates causes any API behavior changes
   - Recommendation: Call without date params for profile; take the most recent record by `set_up_at`

---

## Sources

### Primary (HIGH confidence)
- `@pinta365/oura-api` JSR type library — TypeScript type definitions for all daily endpoints, contributor fields, personal info schema. Verified via WebFetch to jsr.io.
- Phase 1 implementation files (`client.mjs`, `auth.mjs`) — Established patterns for error handling, `DATA_NOT_SYNCED` detection, `ouraGet`/`ouraGetWithRetry` interface. Read directly.
- `02-CONTEXT.md` — All locked decisions (D-01 through D-15). Read directly.
- `.planning/research/PITFALLS.md`, `STACK.md`, `ARCHITECTURE.md` — Phase 1 research artifacts. Read directly.

### Secondary (MEDIUM confidence)
- WebSearch + hedgertronic/oura-ring Python client — Endpoint paths, parameter names, date-only vs datetime distinction confirmed
- WebSearch + multiple sources — `day_summary` values (restored/normal/stressful) for daily stress
- WebSearch + official developer docs fragment — `ring_configuration` response fields (color, design, firmware_version, hardware_type, set_up_at, size)
- WebSearch + community discussions — Confirmation that `personal_info` returns a direct object (not `{ data: [] }`)

### Tertiary (LOW confidence)
- `equivalent_walking_distance` field name in `daily_activity` — referenced in search results, plausible but not verified against live API response

---

## Metadata

**Confidence breakdown:**
- Endpoint paths and parameter names: HIGH — consistent across multiple sources and phase 1 research
- Contributor field names (readiness, sleep): HIGH — JSR type library plus search result corroboration
- Activity response fields: MEDIUM — type library confirms contributors; secondary fields (`high_activity_time` etc.) from search
- Stress `day_summary` enum values: MEDIUM — three values confirmed across multiple sources; exhaustive list unverified
- Ring configuration fields: HIGH — developer docs search result plus JSR type library
- Personal info fields: HIGH — confirmed in official docs and JSR

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable API, 30-day estimate)
