---
phase: 05-integration-cleanup
plan: 01
subsystem: api
tags: [oura, error-handling, auth, oauth2, dashboard, profile]

# Dependency graph
requires:
  - phase: 04-distribution
    provides: "Skill distribution pattern, per-user config, setup.mjs"
  - phase: 02-daily-dashboard
    provides: "dashboard.mjs with Promise.allSettled, extractRecord, ouraGet usage"
provides:
  - "Auth-error-aware dashboard that routes 401/403 to re-auth instructions not sync delays"
  - "Profile with empty-ring pairing message instead of crash or sync-delay"
  - "Clean client.mjs exports (ouraGet, ouraGetWithRetry only — no orphaned formatError)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auth-error check before all-null guard: inspect Promise.allSettled rejection reasons for AUTH_ERRORS before firing sync-delay message"
    - "Ring-specific DATA_NOT_SYNCED catch: use ouraGet directly with inline .catch() for ring_configuration so empty-ring and non-sync errors are separately routed"

key-files:
  created: []
  modified:
    - .claude/skills/oura/scripts/client.mjs
    - .claude/skills/oura/scripts/dashboard.mjs
    - .claude/skills/oura/scripts/profile.mjs

key-decisions:
  - "Used direct rejection reason inspection in dashboard (r.reason?.message) rather than re-throwing from extractRecord — preserves section-collapse behavior for DATA_NOT_SYNCED while surfacing auth errors globally"
  - "Switched ring_configuration fetch from ouraGetWithRetry to ouraGet with inline .catch() — ouraGetWithRetry converts typed error codes to human strings which breaks DATA_NOT_SYNCED detection"

patterns-established:
  - "Pre-allSettled auth check: scan raw allSettled results for auth error codes before interpreting null values as sync delays"
  - "Inline typed catch: for endpoints where per-error-code handling is required, use ouraGet + .catch(typed-check) rather than ouraGetWithRetry"

requirements-completed: [ERR-01, ERR-02, ERR-03, DASH-03, DATA-05]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 5 Plan 1: Integration Cleanup Summary

**Three surgical fixes closing INT-01/02/03: formatError removed, dashboard auth errors route to re-auth instead of sync-delay, profile shows pairing message for empty ring configuration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T22:11:34Z
- **Completed:** 2026-03-22T22:13:16Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Removed orphaned `formatError` export from client.mjs — no callers existed; eliminated dead code
- Added AUTH_ERRORS check in dashboard.mjs before the all-null guard so 401/403/no-token errors produce specific re-auth instructions instead of "data hasn't synced"
- Refactored profile.mjs to use `ouraGet` directly for ring_configuration with inline DATA_NOT_SYNCED catch — empty ring array now shows pairing message rather than crashing or printing sync-delay message

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove orphaned formatError export from client.mjs** - `10459b9` (fix)
2. **Task 2: Classify auth errors in dashboard all-null guard** - `41be26b` (fix)
3. **Task 3: Handle empty ring_configuration with pairing message** - `99f4b78` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `.claude/skills/oura/scripts/client.mjs` - Removed `formatError` function and export; updated exports comment
- `.claude/skills/oura/scripts/dashboard.mjs` - Added AUTH_ERRORS array and pre-guard auth check with process.exit(1) on auth failures
- `.claude/skills/oura/scripts/profile.mjs` - Added `ouraGet` import, switched ring_configuration to direct fetch with inline DATA_NOT_SYNCED catch, added else branch with pairing message

## Decisions Made
- Used `r.reason?.message` inspection in dashboard to check raw allSettled results — keeps `extractRecord` unchanged (returns null for any rejection) while detecting auth codes globally before the sync-delay path fires.
- Switched ring_configuration from `ouraGetWithRetry` to `ouraGet` with inline `.catch()` — `ouraGetWithRetry` converts typed errors to human-readable strings (e.g., "Data not yet synced. Check the Oura app...") which breaks message-based detection; `ouraGet` preserves the original `DATA_NOT_SYNCED` error code string.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 05 integration-cleanup is the final phase; all three defects from the v1.0 audit are closed
- E2E flows "Daily Dashboard" and "Profile" no longer have degraded status
- Skill is ready for v1.0 distribution

## Self-Check: PASSED

- FOUND: .claude/skills/oura/scripts/client.mjs
- FOUND: .claude/skills/oura/scripts/dashboard.mjs
- FOUND: .claude/skills/oura/scripts/profile.mjs
- FOUND: .planning/phases/05-integration-cleanup/05-01-SUMMARY.md
- FOUND commit: 10459b9 (remove formatError)
- FOUND commit: 41be26b (dashboard auth check)
- FOUND commit: 99f4b78 (profile pairing message)

---
*Phase: 05-integration-cleanup*
*Completed: 2026-03-22*
