---
phase: 04-distribution
plan: 01
subsystem: auth
tags: [oauth2, credentials, setup, distribution, config]
dependency_graph:
  requires: []
  provides: [credential-config-system, setup-command]
  affects: [auth.mjs, SKILL.md]
tech_stack:
  added: []
  patterns: [readline/promises, atomic-write, config-file-per-user]
key_files:
  created:
    - .claude/skills/oura/scripts/setup.mjs
  modified:
    - .claude/skills/oura/scripts/auth.mjs
    - .claude/skills/oura/SKILL.md
    - .gitignore
decisions:
  - Per-user config file at ~/.oura/config.json replaces placeholder constants in auth.mjs — enables distribution to other users
  - Env var override (OURA_CLIENT_ID/OURA_CLIENT_SECRET) preserved for power users who prefer environment-based config
  - Atomic write pattern (tmp -> rename -> chmod 0600) reused from saveTokens for config.json write
metrics:
  duration: ~3min
  completed: "2026-03-22T16:16:59Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 4 Plan 1: Credential Config System Summary

Per-user OAuth2 credential storage via ~/.oura/config.json with interactive setup script, replacing hardcoded placeholder constants in auth.mjs.

## Tasks Completed

### Task 1: Create setup.mjs and refactor auth.mjs credential loading

**Commit:** 8f22a5e

**Files:**
- `.claude/skills/oura/scripts/setup.mjs` (created)
- `.claude/skills/oura/scripts/auth.mjs` (modified)
- `.gitignore` (modified)

**Changes:**

Created `setup.mjs`: Interactive credential writer that prompts for `client_id` and `client_secret`, validates both are non-empty, and writes `~/.oura/config.json` using atomic tmp-file-then-rename with `chmod 0600` permissions.

Refactored `auth.mjs`:
- Removed `CLIENT_ID`/`CLIENT_SECRET` placeholder constants (lines 13-14)
- Added `readConfig()` async function that reads `~/.oura/config.json`, with `OURA_CLIENT_ID`/`OURA_CLIENT_SECRET` env var override taking precedence
- `readConfig()` throws `NOT_CONFIGURED` error when config is absent or incomplete
- Updated `buildAuthUrl(state, config)` to accept config parameter
- Updated `waitForCallback(expectedState, config)` to pass config to buildAuthUrl
- Updated `exchangeCode(code, config)` to use `config.client_id`/`config.client_secret`
- Updated `refreshTokens(refreshToken)` to call `readConfig()` internally
- Updated `initAuth()` to call `readConfig()` at entry and thread config through
- Updated `showStatus()` to format `NOT_CONFIGURED` with helpful setup message

Added `.envrc` to `.gitignore`.

### Task 2: Update SKILL.md with /oura setup command

**Commit:** 1c3d898

**Files:**
- `.claude/skills/oura/SKILL.md` (modified)

**Changes:**
- Added `### /oura setup` section before `/oura auth` with command, registration instructions (Oura Developer Dashboard URL, redirect URI), and link to `/oura auth` next step
- Added note in Setup section: if output shows "not configured", direct user to `/oura setup`
- Updated `/oura auth` Note: now references `~/.oura/config.json` instead of placeholder pattern
- Added "Not configured" row to Error Handling table
- Added `~/.oura/config.json` bullet to Notes section

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Per-user config file at `~/.oura/config.json` | Enables distribution — each user configures their own developer app credentials |
| Env var override preserved | Power users who prefer `direnv`/`.envrc` patterns keep existing workflow |
| Atomic write for config.json | Mirrors saveTokens pattern; prevents corrupt config on interrupted write |
| `readline/promises` for setup.mjs | Zero new dependencies — available in Node.js 18+ |

## Verification Results

All acceptance criteria met:

- setup.mjs passes `node -c` syntax check
- auth.mjs passes `node -c` syntax check
- auth.mjs contains `async function readConfig()`
- auth.mjs does NOT contain `YOUR_CLIENT_ID` (grep -c returns 0)
- auth.mjs does NOT contain `YOUR_CLIENT_SECRET`
- auth.mjs contains `NOT_CONFIGURED` error message
- auth.mjs contains `process.env.OURA_CLIENT_ID` env var override
- All four exports preserved: `initAuth`, `readTokens`, `saveTokens`, `showStatus`
- setup.mjs contains `readline/promises` import
- setup.mjs contains `chmod(CONFIG_PATH, 0o600)`
- setup.mjs contains `rename(CONFIG_TMP, CONFIG_PATH)` atomic write
- .gitignore contains `.envrc`
- SKILL.md contains `### /oura setup` section
- SKILL.md contains `node setup.mjs`
- SKILL.md contains `~/.oura/config.json` reference
- SKILL.md does NOT contain old placeholder reference
- SKILL.md contains all original commands: `/oura auth`, `/oura status`, `/oura`, `/oura profile`
- SKILL.md error handling table includes "Not configured" row
- SKILL.md notes section mentions `config.json`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
