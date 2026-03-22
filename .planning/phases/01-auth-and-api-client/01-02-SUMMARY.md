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
  modified: []

key-decisions:
  - "Split ouraGet (single request) and ouraGetWithRetry (retry wrapper) — separation of concerns allows callers to opt out of retry when appropriate"
  - "AUTH_EXPIRED retry calls readTokens() rather than forcing a raw refresh — reuses existing refresh logic in auth.mjs"
  - "403 membership vs scope split reads response body detail field — matches Oura API pattern documented in RESEARCH.md Pitfall 6"

requirements-completed: [ERR-01, ERR-02, ERR-03]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 01 Plan 02: API Client and SKILL.md Summary

**Authenticated HTTP client with typed error classification (429/401/403/426) and exponential backoff retry, plus SKILL.md registering the /oura slash command in Claude Code**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-22T02:03:58Z
- **Completed:** 2026-03-22T02:07:31Z
- **Tasks:** 2 auto (+ 1 checkpoint pending human verification)
- **Files modified:** 2 created

## Accomplishments

- Implemented `client.mjs` with `ouraGet()` for authenticated requests, `ouraGetWithRetry()` for exponential backoff retry (up to 3 attempts, max 30s delay), and `formatError()` for user-friendly error strings
- Full error classification: 429 reads `Retry-After` header, 401 triggers single token refresh retry, 403 distinguishes membership vs scope errors via response body, 426 maps to app update message
- Created `SKILL.md` with YAML frontmatter registering `/oura` command, auth/status command instructions, error handling table, and notes on token storage and Node.js 22+ requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement client.mjs** - `53c2275` (feat)
2. **Task 2: Create SKILL.md** - `a098c84` (feat)

**Task 3 (checkpoint): Awaiting human verification of OAuth flow end-to-end**

## Files Created/Modified

- `.claude/skills/oura/scripts/client.mjs` — Authenticated HTTP client (147 lines)
- `.claude/skills/oura/SKILL.md` — Skill registration for /oura command (70 lines)

## Decisions Made

- Split `ouraGet` and `ouraGetWithRetry` as separate exports — callers that want a single best-effort call can use `ouraGet` directly without retry overhead
- AUTH_EXPIRED retry delegates back to `readTokens()` rather than calling a raw refresh endpoint — this reuses the single-use refresh token handling and atomic write logic already in auth.mjs
- 403 body parsing uses `.catch(() => ({}))` fallback — Oura may return non-JSON 403 bodies in some error paths; the fallback ensures we always get a usable object

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — client.mjs is fully functional. The only stubs in this phase are inherited from Plan 01: `CLIENT_ID = 'YOUR_CLIENT_ID'` and `CLIENT_SECRET = 'YOUR_CLIENT_SECRET'` in `auth.mjs`. These must be replaced (or env vars set) before the OAuth flow works end-to-end. This is the subject of Task 3 (checkpoint).

## Pending: Human Verification (Task 3)

Task 3 is a `checkpoint:human-verify` gate requiring end-to-end OAuth flow verification:

1. Register Oura developer app at https://cloud.ouraring.com/oauth/applications with redirect URI `http://localhost:8910/callback`
2. Set `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` env vars
3. Run `node auth.mjs auth` and confirm browser opens, terminal shows "Authenticated as [email]"
4. Run `node auth.mjs status` and confirm `authenticated: true` in JSON output
5. Verify `~/.oura/tokens.json` with `-rw-------` permissions

---
*Phase: 01-auth-and-api-client*
*Completed: 2026-03-22 (Tasks 1-2; Task 3 pending verification)*
