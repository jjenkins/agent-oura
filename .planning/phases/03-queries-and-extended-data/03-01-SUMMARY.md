---
phase: 03-queries-and-extended-data
plan: 01
subsystem: api
tags: [oura, query, json, stats, pagination, heartrate, multi-endpoint]

# Dependency graph
requires:
  - phase: 01-auth-and-api-client
    provides: ouraGetWithRetry authenticated HTTP client with retry
  - phase: 02-daily-dashboard
    provides: established patterns for date derivation and parallel fetch
provides:
  - Generic query.mjs script fetching any Oura endpoint with stats and pagination
  - Single-endpoint mode with summary stats (avg, min, max, trend, count)
  - Multi-endpoint mode with parallel fetch via Promise.allSettled
  - Heart rate daily aggregation (samples to daily min/avg/max buckets)
  - Stress value-count summary (no numeric score)
  - Date range defaulting (7 days) with 60-day warning
  - Pagination via next_token loop
  - Correlation mode placeholder for Plan 02
affects:
  - 03-02 (correlation mode implementation uses query.mjs as base)
  - SKILL.md (query routing instructions reference query.mjs flags)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Endpoint-aware param builder: heartrate uses start_datetime/end_datetime; all others use start_date/end_date"
    - "fetchAllPages: transparent pagination loop via next_token accumulation"
    - "aggregateHeartRateByDay: group high-frequency samples into daily min/avg/max buckets before output"
    - "computeStats: avg/min/max/trend over fieldFn-extracted numeric values with count"
    - "stressSummary: value-count object for string-valued endpoints"
    - "Promise.allSettled for multi-endpoint parallel fetch with per-endpoint error handling"
    - "FIELD_MAP: declarative endpoint-to-fieldFn mapping for summary stats dispatch"

key-files:
  created:
    - .claude/skills/oura/scripts/query.mjs
  modified: []

key-decisions:
  - "Used getArg() manual arg parser — no minimist/yargs needed for 5 named flags"
  - "fetchAllPages uses do/while with break rather than while(nextToken) to avoid fetching before checking"
  - "computeStats returns count field alongside avg/min/max/trend for Claude to assess sample size"
  - "Correlation mode exits with placeholder JSON (not error exit code) to allow clean Plan 02 addition"
  - "processSingleEndpoint helper extracts shared single-endpoint logic for reuse by multi-endpoint mode"

patterns-established:
  - "Pattern: All output is JSON via process.stdout.write — no plaintext, no chalk, no tables"
  - "Pattern: Main logic wrapped in try/catch; errors output as {error: message} JSON, exit 1"
  - "Pattern: Mode dispatch order is correlate → endpoints → endpoint → usage error"

requirements-completed: [NLQ-02, NLQ-03, DATA-01, DATA-02, DATA-03, DATA-04]

# Metrics
duration: 1min
completed: 2026-03-22
---

# Phase 03 Plan 01: Query Script Summary

**Generic query.mjs script fetching any Oura endpoint with date-range stats, pagination, and heart rate daily aggregation**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-22T05:45:51Z
- **Completed:** 2026-03-22T05:47:08Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created query.mjs (248 lines) as the "dumb pipe with math" for all natural-language query routing
- Single-endpoint mode computes avg/min/max/trend/count stats alongside raw records
- Multi-endpoint mode fetches in parallel with Promise.allSettled, per-endpoint error handling
- Heart rate samples aggregated to daily buckets (bpm_avg/min/max, sample_count, sources) before output
- Pagination transparently handled via next_token loop in fetchAllPages
- Date range defaults to last 7 days; 60-day warning added when exceeded

## Task Commits

Each task was committed atomically:

1. **Task 1: Create query.mjs with single-endpoint and multi-endpoint modes** - `928cdeb` (feat)

**Plan metadata:** (to be added after final commit)

## Files Created/Modified
- `.claude/skills/oura/scripts/query.mjs` - Generic Oura query script: single-endpoint stats, multi-endpoint parallel fetch, heart rate aggregation, pagination, JSON output

## Decisions Made
- Used a simple manual `getArg()` helper for arg parsing — no external library needed for 5 flags
- `computeStats` returns `count` field so Claude can assess sample size adequacy
- Correlation mode exits cleanly with `{"error": "Correlation mode not yet implemented"}` (exit 0) to facilitate Plan 02 addition without breaking SKILL.md routing
- `processSingleEndpoint` extracted as shared helper to avoid duplicating logic between single and multi-endpoint modes
- `fetchAllPages` uses `do/while` with break on absent `next_token` to ensure at least one fetch always runs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- query.mjs is ready for use by SKILL.md query routing instructions
- Plan 02 can implement correlation mode by replacing the placeholder exit with full Pearson r logic
- All extended data endpoints (workout, session, daily_spo2, heartrate) are handled via the FIELD_MAP + special-case dispatch pattern

## Self-Check: PASSED
- `.claude/skills/oura/scripts/query.mjs` exists (248 lines)
- commit `928cdeb` exists in git log

---
*Phase: 03-queries-and-extended-data*
*Completed: 2026-03-22*
