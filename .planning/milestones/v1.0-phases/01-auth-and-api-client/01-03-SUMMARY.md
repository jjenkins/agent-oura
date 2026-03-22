---
phase: 01-auth-and-api-client
plan: 03
subsystem: api-client
tags: [error-handling, api-client, gap-closure, ERR-03]
dependency_graph:
  requires: []
  provides: [DATA_NOT_SYNCED detection, sync-delay user message]
  affects: [.claude/skills/oura/scripts/client.mjs]
tech_stack:
  added: []
  patterns: [empty-array detection on 200 responses, typed error classification]
key_files:
  created: []
  modified:
    - .claude/skills/oura/scripts/client.mjs
decisions:
  - "Threw DATA_NOT_SYNCED from ouraGet (not ouraGetWithRetry) to preserve separation of concerns — ouraGet classifies, ouraGetWithRetry handles user messaging"
  - "Used Array.isArray(json.data) && json.data.length === 0 check to avoid false positives on /personal_info and other object-returning endpoints"
metrics:
  duration: 108s
  completed_date: "2026-03-22T03:08:39Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 01 Plan 03: Empty-Response Detection Summary

**One-liner:** Added DATA_NOT_SYNCED error type to client.mjs that detects HTTP 200 responses with empty data arrays and surfaces a sync-delay message to users, completing ERR-03 coverage.

## What Was Built

Closed the remaining ERR-03 gap in `client.mjs`: when Oura returns `HTTP 200 {"data": []}` (ring hasn't synced data yet), callers now receive a clear error instead of silently getting an empty array.

Three locations modified in `client.mjs`:

1. **`ouraGet()`** — success block now awaits `res.json()`, checks if `json.data` is an empty array, and throws `DATA_NOT_SYNCED` with the raw response attached. Non-data-array responses (e.g., `/personal_info` objects) pass through unchanged.

2. **`ouraGetWithRetry()`** — new catch clause after `APP_UPDATE_REQUIRED` converts `DATA_NOT_SYNCED` into a user-facing message: `"Data not yet synced. Check the Oura app and try again in a few minutes."`

3. **`formatError()`** — new `case 'DATA_NOT_SYNCED'` maps the error code to the same friendly string for callers that handle errors directly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add empty-response detection and sync-delay handling | 896b732 | .claude/skills/oura/scripts/client.mjs |

## Verification Results

- `DATA_NOT_SYNCED` appears 4 times in client.mjs (ouraGet throw, ouraGetWithRetry catch, formatError case, comment) — requirement was >= 3
- `Array.isArray(json.data) && json.data.length === 0` present
- `"Data not yet synced. Check the Oura app and try again in a few minutes."` appears 2 times (ouraGetWithRetry + formatError)
- Module loads cleanly, exports `ouraGet`, `ouraGetWithRetry`, `formatError`
- All prior error types (RATE_LIMITED, AUTH_EXPIRED, AUTH_FORBIDDEN, MEMBERSHIP_REQUIRED, APP_UPDATE_REQUIRED) still present — 18 occurrences

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The DATA_NOT_SYNCED error type is fully wired: detected in ouraGet, user-messaged in ouraGetWithRetry, and formatted in formatError.

## Self-Check: PASSED

- File exists: `/Users/jim/work/src/github.com/jjenkins/agent-oura/.claude/skills/oura/scripts/client.mjs` — FOUND
- Commit 896b732 — FOUND
