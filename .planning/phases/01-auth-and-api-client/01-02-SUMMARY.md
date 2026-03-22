---
phase: 01-auth-and-api-client
plan: 02
subsystem: api-client
tags: [http-client, error-handling, retry, oauth2, skill-registration, rate-limiting]

# Dependency graph
requires:
  - 01-01 (auth.mjs — readTokens export)
provides:
  - Authenticated HTTP client with typed error classification (ouraGet, ouraGetWithRetry, formatError)
  - SKILL.md registering /oura slash command in Claude Code
  - Error classification for 429 (RATE_LIMITED), 401 (AUTH_EXPIRED), 403 (MEMBERSHIP_REQUIRED / AUTH_FORBIDDEN), 426 (APP_UPDATE_REQUIRED)
  - Exponential backoff retry up to 3 attempts with max 30s cap and stderr user feedback
affects:
  - phase 02 (dashboard scripts import ouraGet/ouraGetWithRetry from client.mjs)
  - phase 03 (query scripts import ouraGet/ouraGetWithRetry from client.mjs)

# Tech tracking
tech-stack:
  added:
    - Node.js built-in fetch (authenticated GET requests)
    - Node.js built-in URL (query param building)
  patterns:
    - Error classification: HTTP status codes mapped to typed Error message constants
    - Retry wrapping: ouraGetWithRetry delegates to ouraGet, catches typed errors, retries with backoff
    - User feedback on retry: stderr write before each delay
    - Auth-expired retry: readTokens() called after 401 to force refresh, then single retry
    - formatError(): centralized error-to-message mapping for skill callers

key-files:
  created:
    - .claude/skills/oura/scripts/client.mjs
    - .claude/skills/oura/SKILL.md
  modified:
    - .claude/skills/oura/scripts/auth.mjs (null-email fix in personal_info response)

key-decisions:
  - "Split ouraGet (single request) and ouraGetWithRetry (retry wrapper) — separation of concerns allows callers to opt out of retry when appropriate"
  - "AUTH_EXPIRED retry calls readTokens() rather than forcing a raw refresh — reuses existing refresh logic in auth.mjs"
  - "403 membership vs scope split reads response body detail field — matches Oura API pattern documented in RESEARCH.md Pitfall 6"

requirements-completed: [ERR-01, ERR-02, ERR-03]

# Metrics
duration: ~15min
completed: 2026-03-22
---

# Phase 01 Plan 02: API Client and SKILL.md Summary

**Authenticated HTTP client with typed error classification (429/401/403/426) and exponential backoff retry, plus SKILL.md registering the /oura slash command — end-to-end OAuth flow verified with real Oura credentials**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-22T02:03:58Z
- **Completed:** 2026-03-22T02:16:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint, approved)
- **Files modified:** 2 created, 1 modified (auth.mjs null-email fix)

## Accomplishments

- Implemented `client.mjs` with `ouraGet()` for authenticated requests, `ouraGetWithRetry()` for exponential backoff retry (up to 3 attempts, max 30s delay), and `formatError()` for user-friendly error strings
- Full error classification: 429 reads `Retry-After` header, 401 triggers single token refresh retry, 403 distinguishes membership vs scope errors via response body, 426 maps to app update message
- Created `SKILL.md` with YAML frontmatter registering `/oura` command, auth/status command instructions, error handling table, and notes on token storage and Node.js 22+ requirement
- Human-verified end-to-end OAuth flow with real Oura credentials; tokens stored correctly at `~/.oura/tokens.json` with 0600 permissions

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement client.mjs** - `53c2275` (feat)
2. **Task 2: Create SKILL.md** - `a098c84` (feat)
3. **Task 3: Verify OAuth flow end-to-end** - APPROVED by user
4. **Deviation: Fix null email from personal_info** - `8955edd` (fix)

**Plan metadata:** (final commit to follow)

## Files Created/Modified

- `.claude/skills/oura/scripts/client.mjs` — Authenticated HTTP client with ouraGet, ouraGetWithRetry, formatError (147 lines)
- `.claude/skills/oura/SKILL.md` — Skill registration for /oura command with auth/status instructions and error table (70 lines)
- `.claude/skills/oura/scripts/auth.mjs` — Null-safe email fallback when personal_info returns null (modified)

## Decisions Made

- Split `ouraGet` and `ouraGetWithRetry` as separate exports — callers that want a single best-effort call can use `ouraGet` directly without retry overhead
- AUTH_EXPIRED retry delegates back to `readTokens()` rather than calling a raw refresh endpoint — this reuses the single-use refresh token handling and atomic write logic already in auth.mjs
- 403 body parsing uses `.catch(() => ({}))` fallback — Oura may return non-JSON 403 bodies in some error paths; the fallback ensures we always get a usable object

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null email from Oura personal_info endpoint**

- **Found during:** Task 3 (human-verify — end-to-end OAuth test with real credentials)
- **Issue:** Oura's `/v2/personal_info` endpoint returns `null` for `email` on some accounts; auth.mjs displayed "Authenticated as null" instead of the user's email
- **Fix:** Added null-safe fallback in auth.mjs to display `<email not available>` when email field is null
- **Files modified:** `.claude/skills/oura/scripts/auth.mjs`
- **Verification:** User confirmed authentication output is correct after fix
- **Committed in:** `8955edd`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Null-safe email handling is a correctness fix. No scope creep.

## Issues Encountered

None beyond the null-email edge case documented above. All acceptance criteria met.

## Known Stubs

None — client.mjs is fully functional and wired to auth.mjs. SKILL.md references real script paths.

Note: auth.mjs carries `CLIENT_ID = 'YOUR_CLIENT_ID'` / `CLIENT_SECRET = 'YOUR_CLIENT_SECRET'` fallback constants (documented in 01-01-SUMMARY.md). These are overridden by `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET` env vars, which the user set for the verified OAuth flow.

## Next Phase Readiness

- `ouraGetWithRetry(path, params)` ready for Phase 2 dashboard scripts to import from `client.mjs`
- All Oura error codes (429, 401, 403, 426) produce actionable user messages via `formatError()`
- SKILL.md installed; `/oura auth` and `/oura status` commands are functional
- Human-verified: real OAuth flow works end-to-end with tokens at `~/.oura/tokens.json` with 0600 permissions
- Phase 01 complete — all 4 AUTH requirements and all 3 ERR requirements fulfilled

---
*Phase: 01-auth-and-api-client*
*Completed: 2026-03-22*
