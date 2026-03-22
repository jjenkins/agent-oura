# Project Research Summary

**Project:** agent-oura — Claude Code skill for Oura Ring API v2
**Domain:** Claude Code skill wrapping a third-party health data REST API
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a distributable Claude Code skill that exposes Oura Ring health data (sleep, readiness, activity, stress, heart rate) through natural language queries and a structured daily dashboard. The canonical pattern for this type of skill is a `SKILL.md` entry point with bundled shell or TypeScript scripts that handle OAuth2 authentication and API calls — Claude orchestrates the scripts via its Bash tool, reads stdout, and composes human-readable responses. No web framework or build step is appropriate; the skill must be installable by copying a directory, which rules out compilation artifacts and large `node_modules` trees. The core stack is Node.js 22+ with native `fetch`, a Python `http.server` for the OAuth callback, and lightweight display libraries (`cli-table3`, `chalk`).

The recommended approach is to build authentication first and get it fully correct before touching any API endpoint code. Oura's OAuth2 implementation has two sharp edges that invalidate the auth layer if ignored: refresh tokens are single-use (not reusable across retries), and the full scope list must be declared at first authorization — adding scopes later forces every user to re-authenticate. Both of these are Phase 1 concerns that cannot be retrofitted cheaply. Once auth is solid, the API client, data formatter, dashboard, and natural language query routing follow a clear dependency order that mirrors the architecture's layered component model.

The dominant risks are credential security (tokens must be stored outside the repo with `0600` file permissions), data model surprises (the heart rate endpoint uses `datetime` params instead of `date` params unlike every other endpoint), and silent failures from missing pagination support or stale same-day data. These are all preventable with deliberate decisions early in the build. The product is well-scoped: Oura's API is read-only, so write-back, webhooks, and real-time subscriptions are explicitly off the table.

## Key Findings

### Recommended Stack

The skill-creator pattern defined by the Claude Code open standard dictates the architecture: a `SKILL.md` file with YAML frontmatter and natural-language instructions, plus TypeScript (`.mjs`) scripts in a `scripts/` subdirectory. Claude invokes scripts via its Bash tool; scripts write JSON to stdout; Claude reads and formats the output. This keeps auth secrets out of Claude's reasoning context and makes scripts independently testable.

**Core technologies:**
- `SKILL.md` + TypeScript scripts: skill entry point and orchestration — this IS the correct Claude Code skill pattern; no framework needed
- Node.js 22+ with native `fetch`: HTTP client for Oura API — eliminates external HTTP dependency; stable `fetch` available without flags in v22 LTS
- Python `http.server`: OAuth2 localhost callback receiver — zero-dependency, universally available, appropriate for a 30-second temporary server
- `conf` (sindresorhus, v15.x): token persistence — purpose-built CLI config storage; `keytar` is archived and must not be used
- `open` (v10.x): browser launch for OAuth authorization URL — standard cross-platform CLI solution
- `chalk` (v5.x ESM) + `cli-table3` (v0.6.x): terminal output formatting — industry-standard combination for color-coded tabular health data

**Critical version constraint:** `chalk`, `conf`, and `open` are all ESM-only at their current major versions. All scripts must use `.mjs` extension or `"type": "module"` in `package.json`. Node.js 22+ satisfies all runtime requirements.

### Expected Features

The feature dependency chain is linear and must be respected: OAuth2 auth enables all API calls; API calls enable the dashboard; date-range queries enable trend analysis; trend analysis enables correlation queries. Natural language query routing requires working dashboard and date-range infrastructure before it can reliably route to the right endpoints.

**Must have (table stakes — v1):**
- OAuth2 authorization code flow with token storage and refresh — PATs are deprecated; nothing works without this
- Unified daily dashboard (readiness + sleep + activity + stress) — core value proposition in one command
- Date range querying for all major daily endpoints — users expect "how was last week?" before NL routing exists
- Natural language query routing — primary differentiator; Claude determines endpoint and date range from user's question
- Graceful 401/429 error handling — silent failures make the tool feel broken

**Should have (v1.x, post-validation):**
- Trend analysis with plain-English interpretation — add when users make date-range queries and ask follow-up questions
- Sleep detail drill-down (interval HR/HRV, sleep stages from `/usercollection/sleep`) — add when summary scores are insufficient
- Workout and session summaries — add when athlete users report missing data
- SpO2 + raw heart rate data — add when users want biometric depth beyond daily scores

**Defer (v2+):**
- Correlation queries (behavior-to-metric) — high value, high complexity; needs good data coverage first
- Multi-user credential management — design token storage to support it without building it yet
- Sandbox/test mode — useful for contributors; defer until others extend the skill
- Ring/profile info commands — low urgency

**Anti-features to avoid entirely:** webhooks/real-time subscriptions (requires persistent server; Oura data is batch-updated), write-back to Oura (API is read-only), persistent local database (60-day cache limit + security surface), ASCII charting libraries (fragile across terminal sizes), and web UI (explicitly out of scope).

### Architecture Approach

The architecture separates concerns into four layers: the skill layer (`SKILL.md` + reference docs), the script layer (`auth.ts`, `client.ts`, `format.ts`), the state layer (token file at `~/.config/oura-skill/tokens.json`), and the Claude conversation context where formatted output is returned. Scripts communicate with Claude exclusively through stdout/stderr and exit codes. API credentials (`OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`) flow only through environment variables — never through skill files or Claude's context.

**Major components:**
1. `SKILL.md` — entry point; YAML frontmatter declares name, allowed-tools, and argument hints; body provides Claude instructions for both dashboard and NL query modes; keep under 400 lines
2. `scripts/auth.ts` — full OAuth2 authorization code flow (localhost callback on `:8765`), token read/write with atomic file writes, expiry check and refresh before every API call
3. `scripts/client.ts` — authenticated HTTP GET to Oura API v2; handles both `date` and `datetime` param formats; pagination via `next_token`; rate-limit backoff
4. `scripts/format.ts` — converts raw Oura JSON to markdown with health context (score scales, plain-language interpretation)
5. `~/.config/oura-skill/tokens.json` — persistent token storage outside the repo; `0600` permissions; dir `0700`
6. `endpoints.md` + `format-guide.md` — on-demand reference files loaded by Claude when needed, keeping base context footprint small

**Key patterns:**
- Script-mediated API access: Claude never makes HTTP calls directly
- File-based token persistence: atomic write-then-rename for single-use refresh token safety
- Dual-mode invocation: direct `/oura` renders dashboard; natural language auto-loads via description matching
- Parallel endpoint calls: dashboard fetches all 4 daily endpoints concurrently via `Promise.all()` or parallel Bash tool calls

### Critical Pitfalls

1. **PAT instead of OAuth2** — Implement the full OAuth2 authorization code flow from day one. PATs are deprecated and non-distributable. Most example code online still uses PATs; do not follow it. Recovery cost if retrofitted is HIGH.

2. **Single-use refresh token not persisted atomically** — Write the new refresh token to disk atomically (write to temp file, then rename) before using the new access token. If the write fails after the old token is invalidated, the user loses access permanently and must re-authenticate. Oura's docs note this but it is easy to miss.

3. **Incomplete OAuth scope list at first authorization** — Declare the full scope set upfront: `personal daily heartrate workout tag session spo2`. Adding scopes later requires all users to re-authenticate with no clear error signal (401 looks like auth failure, not scope failure).

4. **Tokens stored in skill directory or committed to git** — Store tokens at `~/.config/oura-skill/tokens.json` with `0600` permissions. Never put token files inside `.claude/skills/` or any committed path. Add `.gitignore` entries as a safety net.

5. **Mismatched date vs. datetime parameters** — Most endpoints use `start_date`/`end_date` (YYYY-MM-DD). The heart rate endpoint uses `start_datetime`/`end_datetime` (ISO 8601). Build separate param helpers and apply them explicitly per endpoint. Passing wrong format silently returns empty data.

## Implications for Roadmap

Based on research, the component dependency graph, and pitfall-to-phase mapping, here is the recommended phase structure:

### Phase 1: Authentication Foundation

**Rationale:** Everything in the project depends on working OAuth2 with correct token handling. Getting this wrong means rewriting the entire auth layer — the highest recovery cost of any pitfall. This must be built and validated in isolation before any API client code is written.

**Delivers:** Working OAuth2 authorization code flow; secure token storage outside the repo with correct permissions; automatic token refresh with atomic file writes; complete scope declaration; scope validation on startup.

**Addresses:** OAuth2 auth + token storage (P1 feature), token persistence across sessions (P1 feature)

**Avoids:** PAT auth (Pitfall 1), single-use refresh token loss (Pitfall 2), incomplete scope list (Pitfall 5), tokens in plaintext or committed (Pitfall 4)

**Stack elements:** Python `http.server` (callback server), `open` (browser launch), `conf` or plain `fs` with atomic writes for token file, environment variables for client credentials

**Research flag:** Standard OAuth2 pattern — well-documented in Oura official docs. No deeper research phase needed. Validate the exact token endpoint URL and refresh token behavior against live sandbox.

### Phase 2: API Client Layer

**Rationale:** With auth working, the client layer can be built against real token-authenticated calls. Type definitions should be derived from actual API responses (not docs), so they come after initial client calls return data.

**Delivers:** Authenticated GET client for all planned Oura endpoints; separate date and datetime param builders; pagination support via `next_token`; 429 backoff and 401 refresh-and-retry; 426 and 403 membership error handling; TypeScript type definitions from real responses.

**Addresses:** Date range querying (P1), graceful 401/429 error handling (P1), SpO2/heart rate data (P2 groundwork)

**Avoids:** Date vs. datetime parameter mismatch (Pitfall 3), missing pagination (technical debt), generic 426/403 error messages (UX pitfall)

**Architecture component:** `scripts/client.ts` + `scripts/types.ts`

**Research flag:** Standard REST client pattern. Validate actual response shapes against docs — Oura's spec has diverged from actual responses in the past. Use sandbox environment throughout.

### Phase 3: Dashboard and Formatter

**Rationale:** With a working API client returning real data, the formatter and dashboard can be designed against actual values. Format decisions (score colors, contributor display, scale context) require seeing real data. Same-day data edge cases only manifest with real API calls.

**Delivers:** `format.ts` converting raw Oura JSON to markdown with score context and plain-language interpretation; `format-guide.md` style guide; unified daily dashboard (`/oura`) fetching all 4 daily endpoints in parallel; graceful fallback when today's data is not yet available (sync timing).

**Addresses:** Unified daily dashboard (P1), natural language query routing groundwork

**Avoids:** Raw scores without health context (UX pitfall), same-day missing data treated as error (UX pitfall), raw heart rate rows (UX pitfall)

**Stack elements:** `chalk` 5.x (color-coded scores), `cli-table3` (tabular output)

**Research flag:** No research phase needed. Standard terminal formatting with well-documented libraries.

### Phase 4: Natural Language Query Routing

**Rationale:** NL query routing requires Dashboard (Phase 3) and Date Range (Phase 2) to be solid. Claude's routing logic in `SKILL.md` needs working endpoint infrastructure to call. Build on top of validated Phase 2/3 components.

**Delivers:** Expanded `endpoints.md` covering all supported Oura endpoints with param formats and data shapes; updated `SKILL.md` instructions for NL routing mode; tested query patterns ("how did I sleep this week?", "compare my readiness last two weeks"); response caching for repeated same-session queries.

**Addresses:** Natural language query routing (P1), trend analysis (P2)

**Avoids:** Re-fetching identical ranges in multi-step NL conversations (performance trap)

**Research flag:** Claude's NL routing capability is the differentiator but is also a black box — behavior depends on SKILL.md instruction quality. May benefit from iterative testing rather than research. No external research phase needed.

### Phase 5: Extended Data Types (v1.x)

**Rationale:** Add remaining data types (workout, session, SpO2, detailed sleep) once core dashboard and NL routing are validated with real usage. Each adds an endpoint call with established patterns; no architectural change needed.

**Delivers:** Workout and session summary commands; SpO2 daily averages; detailed sleep drill-down (interval HR/HRV, sleep stages from `/usercollection/sleep` vs. `/usercollection/daily_sleep`); updated `endpoints.md`.

**Addresses:** Sleep detail drill-down (P2), workout/session summaries (P2), SpO2 + heart rate data (P2)

**Avoids:** Note: `sleep` (detailed) vs. `daily_sleep` (scored) are different endpoints — must document clearly to avoid user confusion.

**Research flag:** No research phase needed. Standard endpoint additions following Phase 2 patterns. Heart rate datetime parameter format already handled in Phase 2.

### Phase 6: Distribution and Packaging

**Rationale:** Setup script, installation instructions, and credential configuration guide depend on stable internals. Distribution packaging is always last because it requires knowing exactly what users need to install and configure.

**Delivers:** Setup script automating skill installation; README with OAuth app registration steps, environment variable configuration, and first-run auth walkthrough; tested fresh-install experience on a clean machine; `.gitignore` entries verified.

**Addresses:** Sandbox/test mode (P3, if included here)

**Avoids:** Credential exposure in distributed files; shared client ID/secret across users (each user registers their own Oura developer app)

**Research flag:** No research phase needed. Standard CLI tool distribution patterns.

### Phase Ordering Rationale

- Auth-first ordering is dictated by the component dependency graph: every other component imports from `auth.ts`
- API client before formatter because format decisions require seeing real data shapes
- Dashboard before NL routing because NL routing depends on knowing which endpoints work and what they return
- Extended data types deferred until core is validated — avoids building complex features on unvalidated infrastructure
- Distribution last because packaging depends on stable internals and complete feature set

The pitfall-to-phase mapping from PITFALLS.md directly confirms this ordering: all 5 critical pitfalls map to Phase 1 or Phase 2 (auth and API client), reinforcing that these phases carry the highest technical risk and must be built most carefully.

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Auth):** Oura OAuth2 documented officially; PKCE vs. standard code flow already researched; `conf` and token storage patterns clear
- **Phase 2 (API Client):** Standard REST client; pitfalls identified and preventable; sandbox available for testing
- **Phase 3 (Dashboard):** Standard terminal formatting; `chalk` and `cli-table3` well-documented
- **Phase 4 (NL Routing):** Iterative SKILL.md tuning; no external research applicable
- **Phase 5 (Extended Data):** Follows Phase 2 patterns; datetime param handling already accounted for
- **Phase 6 (Distribution):** Standard CLI distribution

No phases require a `/gsd:research-phase` during planning. All technical uncertainties are already resolved or are best addressed through sandbox testing rather than additional research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Official Claude Code skills docs verified HIGH; `conf` and token storage MEDIUM (keytar deprecated, alternatives researched but not battle-tested in a skill context) |
| Features | HIGH | Oura API v2 endpoints well-documented; feature set validated against 3 comparable OSS tools; MVP scope is conservative and realistic |
| Architecture | HIGH | Skill structure from official Claude Code docs; OAuth2 from official Oura docs; credential patterns confirmed across multiple community sources |
| Pitfalls | MEDIUM-HIGH | Critical Oura API behaviors (single-use refresh, scope constraints) from official docs; Claude Code skill security findings from community sources with consistent agreement |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **OAuth2 PKCE vs. standard code flow:** Oura docs do not explicitly document PKCE support. Research found no `code_challenge` parameter in Oura's OAuth flow. Architecture assumes standard Authorization Code with `client_secret`. Validate during Phase 1 sandbox testing — if PKCE is required, the auth flow changes slightly but not structurally.

- **Oura sandbox completeness:** Sandbox at `https://api.ouraring.com/sandbox` is available but the research did not verify which endpoints are fully mocked vs. partially supported. Validate each planned endpoint against the sandbox in Phase 2 before relying on it for development.

- **`conf` vs. plain `fs` for token storage:** `conf` (sindresorhus) adds a convenient abstraction but is a dependency. For a tool with exactly two tokens and an expiry timestamp, plain `fs` with atomic writes (write to `.tmp`, then `rename`) may be simpler and dependency-free. Decide during Phase 1 implementation.

- **Data freshness timing:** The exact cutoff time at which today's sleep/readiness data becomes available via the API is not documented. The graceful fallback to yesterday's data in Phase 3 needs to be tested empirically against the sandbox or a real account.

- **Claude skill context budget:** The research notes that skill descriptions count against approximately 2% of Claude's context window. This needs validation once `SKILL.md` is drafted — keep under 400 lines and measure context usage in practice.

## Sources

### Primary (HIGH confidence)
- [Claude Code Skills official documentation](https://code.claude.com/docs/en/skills) — skill structure, frontmatter, script bundling, Bash tool invocation
- [Oura API v2 official docs](https://cloud.ouraring.com/v2/docs) — endpoint list, response shapes, error handling
- [Oura OAuth2 authentication docs](https://cloud.ouraring.com/docs/authentication) — authorization URL, token exchange, single-use refresh token behavior
- [atom/node-keytar GitHub](https://github.com/atom/node-keytar) — confirmed archived December 2022

### Secondary (MEDIUM confidence)
- [sindresorhus/conf GitHub](https://github.com/sindresorhus/conf) — encryption support, version, CLI config storage pattern
- [Pinta365/oura_api TypeScript library](https://jsr.io/@pinta365/oura-api/doc) — OAuth2 flow methods, available scopes, response model structure
- [hedgertronic/oura-ring Python client](https://github.com/hedgertronic/oura-ring) — date vs. datetime param handling, endpoint coverage
- [oura-telegram-reports OSS bot](https://github.com/seoshmeo/oura-telegram-reports) — feature set for AI-powered Oura tool, NL query patterns
- [MindStudio Claude Code Skills Common Mistakes](https://www.mindstudio.ai/blog/claude-code-skills-common-mistakes-guide) — skill credential storage patterns
- [Oura API rate limit docs](https://cloud.ouraring.com/docs/error-handling) — 5000 req/5min confirmed
- [npm-compare: cli-table variants](https://npm-compare.com/cli-table,cli-table3,console-table-printer,table,text-table) — `cli-table3` as maintained fork

### Tertiary (LOW confidence)
- Home Assistant Oura v2 integration community discussion — real-world bug reports for edge cases (426, membership gates, data freshness timing)
- WebSearch community findings on credential management patterns for Claude Code skills

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
