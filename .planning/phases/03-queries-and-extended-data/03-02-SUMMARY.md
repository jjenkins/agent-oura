---
phase: 03-queries-and-extended-data
plan: 02
subsystem: api
tags: [oura, query, correlation, pearson, skill, nlq, routing]

# Dependency graph
requires:
  - phase: 03-queries-and-extended-data
    plan: 01
    provides: query.mjs with single/multi-endpoint modes and correlation placeholder
provides:
  - Pearson r correlation mode in query.mjs
  - Semantic correlation categories (Strong Positive through Strong Negative)
  - Day-offset alignment for time-shifted correlation analysis
  - Warning system for small sample sizes (< 7 aligned days)
  - SKILL.md Query Routing section enabling Claude NLP routing
  - Endpoint name mapping table for all 8 Oura endpoint types
  - Date range derivation guidance with 7-day default and 60-day max
affects:
  - SKILL.md (query routing is now complete for Claude NLP layer)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pearson correlation: manual computation over aligned pairs, null for insufficient/no-variance data"
    - "Offset alignment: Map keyed by day string for O(1) B-value lookup, add offset*MS_PER_DAY to A's date"
    - "Semantic bridge: correlationCategory() translates r float to 6 human-readable strings"
    - "extractValues(): dispatches to FIELD_MAP or heartrate aggregation, returns null for non-numeric endpoints"
    - "SKILL.md as NLP routing layer: maps user language to endpoint names, date ranges, and script invocations"

key-files:
  created: []
  modified:
    - .claude/skills/oura/scripts/query.mjs
    - .claude/skills/oura/SKILL.md

key-decisions:
  - "pearson() returns null (not NaN/0) for degenerate inputs so correlationCategory() can produce 'Insufficient Data'"
  - "Offset alignment uses getTime() + offset*MS_PER_DAY then toISOString().slice(0,10) for reliable day arithmetic"
  - "sample_size warning threshold set at 7 days (aligns with standard correlation significance guidance)"
  - "Combined dateWarning and sampleWarning into a single warning string to keep output schema stable"
  - "SKILL.md instructs Claude to never show raw r-value — only the semantic category string"

# Metrics
duration: 1min
completed: 2026-03-22
---

# Phase 03 Plan 02: Correlation Mode and Query Routing Summary

**Pearson r correlation mode added to query.mjs; SKILL.md updated with comprehensive query routing to make Claude the NLP layer for all Oura health questions**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-22T05:49:19Z
- **Completed:** 2026-03-22T05:50:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `pearson(xs, ys)` computing Pearson r with null guard for insufficient data (n < 3) and zero variance
- Added `correlationCategory(r)` with 6 semantic categories from 'Insufficient Data' to 'Strong Negative'
- Added `extractValues(records, ep)` dispatching to FIELD_MAP or heartrate aggregation path, returning null for daily_stress/workout/session
- Implemented full correlation mode: parallel fetch, heartrate pre-aggregation, day-offset alignment via O(1) Map lookup, < 7 sample warning, JSON output with mode/endpoint_a/endpoint_b/offset_days/correlation/aligned_pairs
- Added `## Query Routing` to SKILL.md: today vs. multi-day routing, all three query invocation patterns, 8-endpoint name mapping table, date derivation table with 7-day default and 60-day max, output interpretation guide, correlation interpretation instructions (including r-value suppression), and ambiguous question handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Add correlation mode to query.mjs** - `f1fda3b` (feat)
2. **Task 2: Update SKILL.md with query routing instructions** - `9045b9c` (feat)

## Files Created/Modified

- `.claude/skills/oura/scripts/query.mjs` - Added pearson(), correlationCategory(), extractValues(), and full correlation mode replacing the Plan 01 placeholder
- `.claude/skills/oura/SKILL.md` - Added 90-line Query Routing section; total file is 193 lines (under 220 limit)

## Decisions Made

- `pearson()` returns `null` (not NaN/0) for degenerate inputs so `correlationCategory()` can branch to 'Insufficient Data'
- Offset day arithmetic uses `getTime() + offset * MS_PER_DAY` then `toISOString().slice(0,10)` — reliable across DST boundaries
- Sample size warning threshold at 7 days aligns with common correlation significance guidance stated in plan
- Combined date range warning and sample size warning into a single `warning` string to keep the JSON schema stable (one nullable field)
- SKILL.md instructs Claude to never show the raw r-value — only the semantic category — protecting users from misinterpreting a floating-point coefficient

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The full natural-language query pipeline is complete: dashboard.mjs for today, query.mjs for multi-day and correlation
- SKILL.md now routes any Oura health question to the right script and arguments
- Phase 03 objectives NLQ-01 and NLQ-04 are satisfied

## Self-Check: PASSED

- `.claude/skills/oura/scripts/query.mjs` syntax check: PASSED
- `.claude/skills/oura/SKILL.md` line count: 193 (under 220)
- commit `f1fda3b` exists: VERIFIED
- commit `9045b9c` exists: VERIFIED

---
*Phase: 03-queries-and-extended-data*
*Completed: 2026-03-22*
