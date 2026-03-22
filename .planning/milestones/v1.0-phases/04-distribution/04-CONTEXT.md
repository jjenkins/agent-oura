# Phase 4: Distribution - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Installable skill packaging, setup script, and user documentation. Any Claude Code user can install and configure the skill from scratch without guidance beyond the included documentation. Does NOT include new features, new data types, or changes to the skill's runtime behavior.

</domain>

<decisions>
## Implementation Decisions

### Credential strategy
- **D-01:** Each user registers their own Oura developer app at https://cloud.ouraring.com/oauth/applications — no shared/embedded credentials. **Overrides Phase 1 D-10/D-11/D-12.**
- **D-02:** Credentials stored in `~/.oura/config.json` as `{ "client_id": "...", "client_secret": "..." }` alongside the existing `~/.oura/tokens.json`
- **D-03:** Env vars (`OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`) still work as overrides on top of config.json — power users and CI can use env vars without touching config
- **D-04:** `/oura setup` command guides users through credential configuration — prompts for client_id and client_secret, writes to `~/.oura/config.json`
- **D-05:** Running `/oura setup` when already configured just overwrites — no confirmation prompt needed
- **D-06:** `auth.mjs` must be updated to read from `~/.oura/config.json` as the default, with env vars as override. The current `YOUR_CLIENT_ID` placeholder pattern is removed.

### Installation method
- **D-07:** One-liner install via `install.sh` at repo root — user runs `curl -sL <raw-url>/install.sh | bash` from their project directory
- **D-08:** Per-project installation into `.claude/skills/oura/` (not global `~/.claude/skills/`)
- **D-09:** `install.sh` handles the full end-to-end flow:
  1. Verify Node.js 22+ is available (warn and exit if not)
  2. Clone/copy skill files (SKILL.md + scripts/) into `.claude/skills/oura/`
  3. Run `npm install` in the scripts/ directory
  4. Prompt for client_id and client_secret, write `~/.oura/config.json`

### Setup documentation
- **D-10:** Primary documentation in `README.md` at repo root — one-stop shop
- **D-11:** README includes: what the skill does, prerequisites, install command, Oura app registration walkthrough, first-run auth, usage reference, and troubleshooting
- **D-12:** Oura developer app registration walkthrough is step-by-step with annotated screenshots (exact steps for each field, redirect URI = `http://localhost:8910/callback`)
- **D-13:** Usage section covers all commands: `/oura`, `/oura auth`, `/oura profile`, `/oura status`, and natural-language query examples
- **D-14:** Troubleshooting section covers: Node.js version mismatch, wrong redirect URI, expired tokens, rate limits, missing Oura membership

### Claude's Discretion
- install.sh implementation details (git clone vs curl of individual files)
- README formatting and section ordering
- Whether screenshots are actual images or described placeholders (pending access to Oura developer portal)
- setup.mjs script structure for the `/oura setup` command
- How to detect and report the current Node.js version in install.sh

</decisions>

<specifics>
## Specific Ideas

- The install experience should feel like a 2-minute setup: run one command, paste two credentials, done
- Developer app registration is the only friction point — the README walkthrough should make it foolproof
- The `YOUR_CLIENT_ID` placeholder pattern in auth.mjs needs to be replaced with config.json reads — this is a code change, not just documentation

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Skill structure
- `.claude/skills/oura/SKILL.md` — Current skill entry point, command definitions, query routing instructions — must be extended with `/oura setup` command
- `.claude/skills/oura/scripts/auth.mjs` — Current auth implementation with `YOUR_CLIENT_ID` placeholder and env var override pattern — must be refactored to read from `~/.oura/config.json`
- `.claude/skills/oura/scripts/package.json` — Current dependencies (only `open`)

### Prior decisions
- `.planning/phases/01-auth-and-api-client/01-CONTEXT.md` — Phase 1 credential decisions D-10/D-11/D-12 (shared app) are **overridden** by this phase's D-01
- `.planning/phases/01-auth-and-api-client/01-CONTEXT.md` — D-13 through D-17 (token storage, atomic writes, status command) remain valid

### Project
- `.planning/PROJECT.md` — Core value, constraints
- `.planning/REQUIREMENTS.md` — DIST-01, DIST-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auth.mjs` already supports `OURA_CLIENT_ID`/`OURA_CLIENT_SECRET` env var overrides — the config.json read can follow the same pattern (check config, then check env, then fail with "run /oura setup")
- `auth.mjs` already has `TOKEN_DIR` (`~/.oura/`) and `mkdir` logic — config.json can share this directory and setup pattern
- `auth.mjs` `showStatus` already validates tokens — can be extended to also show config status

### Established Patterns
- Scripts are ESM `.mjs` files in `.claude/skills/oura/scripts/`
- `~/.oura/` is the credential/config directory (0600 permissions)
- SKILL.md instructs Claude how to run each script and interpret output
- Atomic file writes via write-to-temp-then-rename

### Integration Points
- `auth.mjs` constants section (lines 13-14) must change from placeholder-with-env-override to config-file-with-env-override
- SKILL.md must add `/oura setup` command documentation
- `install.sh` writes to `.claude/skills/oura/` in the current project directory
- `install.sh` writes to `~/.oura/config.json` (same directory as tokens.json)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-distribution*
*Context gathered: 2026-03-22*
