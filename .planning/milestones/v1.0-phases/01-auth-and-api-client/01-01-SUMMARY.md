---
phase: 01-auth-and-api-client
plan: 01
subsystem: auth
tags: [oauth2, node-http, fs-promises, crypto, open, token-persistence, atomic-write]

# Dependency graph
requires: []
provides:
  - OAuth2 authorization code flow via Node.js http callback server on port 8910
  - Atomic token persistence to ~/.oura/tokens.json with 0600 permissions
  - Transparent token refresh (reads tokens, refreshes if within 60s of expiry)
  - initAuth, readTokens, saveTokens, showStatus exports from auth.mjs
  - ESM package.json with open dependency for cross-platform browser launch
affects:
  - 01-02-api-client (imports readTokens from auth.mjs)
  - phase 02 (dashboard scripts import readTokens)
  - phase 03 (query scripts import readTokens)

# Tech tracking
tech-stack:
  added:
    - open@11.0.0 (cross-platform browser launch for OAuth URL)
    - Node.js built-in http (OAuth callback server)
    - Node.js built-in crypto (randomBytes for CSRF state param)
    - Node.js built-in fs/promises (atomic token persistence)
  patterns:
    - Atomic write: writeFile to .tmp then rename to final path (POSIX atomic same-fs)
    - Transparent refresh: readTokens() checks expiry and refreshes before returning
    - Single-use refresh token: always saveTokens() before returning from refreshTokens()
    - Bind callback server to 127.0.0.1 (not 0.0.0.0) for local-only exposure
    - Fixed port 8910 with EADDRINUSE error handling

key-files:
  created:
    - .claude/skills/oura/scripts/package.json
    - .claude/skills/oura/scripts/package-lock.json
    - .claude/skills/oura/scripts/auth.mjs
    - .gitignore
  modified: []

key-decisions:
  - "Use Node.js built-in http module for callback server (same runtime, zero extra dependency vs Python)"
  - "Support OURA_CLIENT_ID / OURA_CLIENT_SECRET env var overrides for power users (decided at discretion)"
  - "open dependency pinned to ^11.0.0 (ESM-only, Node.js 18+ compatible)"
  - "No write-file-atomic package needed — plain fs.rename() is atomic on POSIX same-filesystem"

patterns-established:
  - "Pattern: Atomic token write — writeFile(tmp) + rename(tmp, final) + chmod(0o600) after rename"
  - "Pattern: readTokens() as single entry point — transparently refreshes expired tokens"
  - "Pattern: Error signals via Error message string constants (NOT_AUTHENTICATED, REFRESH_FAILED)"
  - "Pattern: CLI entry point at bottom of .mjs file, process.argv[2] sub-command dispatch"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 01 Plan 01: Auth and API Client - OAuth2 Flow and Token Persistence Summary

**OAuth2 authorization code flow with atomic token persistence to ~/.oura/tokens.json and transparent single-use refresh token handling via Node.js built-in http, crypto, and fs/promises**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T01:53:45Z
- **Completed:** 2026-03-22T02:01:26Z
- **Tasks:** 2
- **Files modified:** 4 created + 1 .gitignore

## Accomplishments

- Created ESM package.json with `open@11.0.0` as the sole external dependency and npm install complete
- Implemented full OAuth2 authorization code flow in auth.mjs: callback server on 127.0.0.1:8910, state CSRF validation, token exchange, identity confirmation via personal_info
- Atomic token persistence with temp-file-then-rename pattern and 0600 permissions — prevents refresh token loss on write failure
- Transparent token refresh in readTokens(): checks expiry within 60s buffer, persists single-use refresh token to disk before returning new access token
- JSON status output via showStatus() for /oura status command with email, expiry, and live connection check

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package.json and install open dependency** - `67c205b` (chore)
2. **Task 2: Implement auth.mjs** - `23d9b06` (feat)
3. **Deviation: Add .gitignore** - `8a84ea2` (chore)

**Plan metadata:** (final commit to follow)

## Files Created/Modified

- `.claude/skills/oura/scripts/package.json` - ESM module config with open ^11.0.0 dependency
- `.claude/skills/oura/scripts/package-lock.json` - Lock file from npm install
- `.claude/skills/oura/scripts/auth.mjs` - OAuth2 flow, token persistence, refresh, status (277 lines)
- `.gitignore` - Excludes node_modules/ from version control

## Decisions Made

- Used Node.js built-in `http` module for callback server instead of Python http.server — same zero-dependency story, same runtime as the .mjs scripts, avoids spawning a second language process
- Added `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET` env var overrides per discretion guidance in RESEARCH.md — costs nothing, gives enterprise users escape hatch for their own app registration
- Used plain `fs.rename()` for atomic writes instead of `write-file-atomic` package — sufficient for local `~/.oura/` on macOS/Linux POSIX filesystem; `write-file-atomic` documented as upgrade path if NFS issues arise
- `open` dependency pinned to `^11.0.0` per CLAUDE.md (RESEARCH.md specified 11.0.0 as latest)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added .gitignore to exclude node_modules**

- **Found during:** Post-Task 2 (git status check after commit)
- **Issue:** `git status --short` showed `node_modules/` as untracked — would be accidentally staged in future commits
- **Fix:** Created `.gitignore` with `node_modules/` entry and committed separately
- **Files modified:** `.gitignore` (created)
- **Verification:** `git status --short` shows node_modules/ no longer appears as untracked
- **Committed in:** `8a84ea2`

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical)
**Impact on plan:** .gitignore is necessary to prevent accidental node_modules commits. No scope creep.

## Issues Encountered

None — plan executed cleanly. All acceptance criteria met on first attempt.

## Known Stubs

- `CLIENT_ID = 'YOUR_CLIENT_ID'` in auth.mjs line ~14 — placeholder value. Requires embedding real Oura developer app credentials before auth flow will work end-to-end. This is intentional per D-10/D-11 (credentials will be added when Oura developer app is registered).
- `CLIENT_SECRET = 'YOUR_CLIENT_SECRET'` in auth.mjs line ~15 — same as above.

These stubs prevent live OAuth flow but do NOT prevent the plan's goal: the module structure, token persistence, and refresh logic are all correct. The credential values will be added in a future step after Oura developer app registration.

## User Setup Required

Before the auth flow will work end-to-end:
1. Register an OAuth2 app at https://cloud.ouraring.com/oauth/applications
2. Set redirect URI to `http://localhost:8910/callback`
3. Replace `YOUR_CLIENT_ID` and `YOUR_CLIENT_SECRET` in `.claude/skills/oura/scripts/auth.mjs` (or set `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET` env vars)

## Next Phase Readiness

- auth.mjs exports are ready for import by Phase 1 Plan 02 (API client — client.mjs)
- Token file path (`~/.oura/tokens.json`) established and documented for all subsequent phases
- Error signal constants (`NOT_AUTHENTICATED`, `REFRESH_FAILED`) documented for callers to handle
- Scope list locked: `personal daily heartrate workout tag session spo2` — cannot be changed without re-auth

---
*Phase: 01-auth-and-api-client*
*Completed: 2026-03-22*
