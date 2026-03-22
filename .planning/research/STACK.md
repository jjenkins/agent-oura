# Stack Research

**Domain:** Claude Code skill wrapping a health data REST API (Oura Ring v2)
**Researched:** 2026-03-21
**Confidence:** MEDIUM — skill-creator pattern verified HIGH from official docs; OAuth2 and HTTP choices verified MEDIUM; token storage MEDIUM (keytar deprecated, alternatives researched)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SKILL.md + shell scripts | N/A (Claude Code open standard) | Skill entry point and orchestration | This IS the skill-creator pattern. A `SKILL.md` with YAML frontmatter defines the slash command and instructions; bundled shell or Python scripts handle OAuth flows and data fetching that can't happen inside a prompt. No framework needed — just files in `.claude/skills/oura/`. |
| Node.js (built-in fetch) | v22+ (LTS) | HTTP client for Oura API calls | Node.js v22 includes stable native `fetch`. No external HTTP library needed for a skills script. Eliminates one dependency, reduces install surface, and works in any Node.js environment without npm. Use `fetch` directly. |
| Python 3 (fallback) | 3.11+ | OAuth callback server script | The skill's OAuth flow requires a temporary localhost HTTP server to receive the authorization code redirect. Python's `http.server` module is zero-dependency and universally available on developer machines — no npm install required. Claude Code itself ships a Python 3 runtime. Shell scripts plus Python is the pattern used in official Claude Code skill examples. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `conf` (sindresorhus) | 15.x | Persistent token storage across sessions | Use to store OAuth access token, refresh token, and expiry time in a platform-appropriate config directory (`~/.config/` on Linux, `~/Library/Application Support/` on macOS). Supports optional `encryptionKey` for obfuscating stored tokens. Actively maintained (last published ~2 months ago as of research date). |
| `open` (sindresorhus) | 10.x | Open the Oura authorization URL in the user's browser | Required for the OAuth2 authorization code flow — CLI tools cannot redirect automatically, so the skill must open the browser and wait for the localhost callback. `open` is the standard cross-platform solution. |
| `chalk` | 5.x (ESM) | ANSI color in terminal output | Use for the health dashboard: color-code scores (green/yellow/red), dim secondary data, bold labels. Chalk 5.x is ESM-only — ensure scripts use `"type": "module"` or `.mjs` extension. |
| `cli-table3` | 0.6.x | Tabular data display in terminal | Use for daily dashboard tables (sleep, readiness, activity side by side). The original `cli-table` is unmaintained; `cli-table3` is the maintained fork with 4,500+ dependents and active releases. Avoid `table` (npm) — slower adoption and less ergonomic API for this use case. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node --watch` | Script development without a watcher dep | Built into Node.js v22. Run the OAuth and data scripts during development without nodemon. |
| Oura sandbox environment | Test without real account data | Oura provides a sandbox at `https://api.ouraring.com/sandbox` — use this for all development to avoid polluting real health data. |
| Oura Developer Dashboard | Register OAuth2 app, get `client_id`/`client_secret` | Required before any OAuth work. Register at `https://cloud.ouraring.com/oauth/applications`. Register `http://localhost:PORT/callback` as the redirect URI during development. |

## Installation

```bash
# Skills don't have a package.json in the skill directory itself.
# Scripts are run directly by Claude via Bash tool.
# If you do scaffold a helper package for the scripts:

# Core (if packaging scripts as a Node.js module)
npm install conf open chalk cli-table3

# No build step needed — write scripts as .mjs (ESM) files
# Dev dependencies (if adding tests for the OAuth flow scripts)
npm install -D @types/node
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native `fetch` (Node.js 22+) | `axios` | Use axios only if you need request interceptors for automatic token refresh across many call sites. For a skill with a small, controlled script surface, axios adds 11.7kB and complexity without benefit. |
| Native `fetch` (Node.js 22+) | `got` | got is faster and more Node-idiomatic than axios, but still an external dependency. Only worth it if doing complex retry logic (got has built-in retry). For Oura's read-only API with sensible rate limits (5000 req/5 min), native fetch suffices. |
| `conf` (file-based) | `keytar` (OS keychain) | `keytar` (atom/node-keytar) was archived in December 2022 and is no longer maintained. Do NOT use. `conf` with an `encryptionKey` derived from a user-supplied passphrase or machine ID is the practical CLI alternative. For users who want OS keychain integration, `@zowe/secrets-for-zowe-sdk` is the maintained successor but adds significant complexity. |
| `conf` (file-based) | `keyv` with SQLite backend | Keyv is excellent for cache-style storage with TTL, but overengineered for storing two tokens and an expiry timestamp. `conf` is purpose-built for CLI app config. |
| Python `http.server` (OAuth callback) | Express.js server | Express requires npm install and is overkill for a 20-line OAuth callback handler that runs for 30 seconds. Python's `http.server` is zero-dependency and available on every macOS/Linux dev machine. |
| Shell/Python scripts | Full TypeScript compile step | TypeScript with a build step (tsc or esbuild) adds complexity that fights the skill distribution model. Skills are installed by copying a directory — a `node_modules/` or `dist/` folder breaks that. Write scripts as `.mjs` (native ESM) or plain shell. |
| `chalk` 5.x | `kleur` | Both are fine. `chalk` has 10x the download volume and is the de facto standard. Use `kleur` only if you need a smaller footprint and are comfortable with a less common API. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `keytar` (atom/node-keytar) | Archived December 2022, no longer maintained. Has native binary compilation issues on modern Node.js/Apple Silicon. | `conf` with obfuscated encryption key, or prompt users for a passphrase on first run |
| Personal Access Tokens (PATs) | Oura is deprecating PATs. Skills must use OAuth2 to be distributable to other users who have their own Oura accounts. | OAuth2 Authorization Code flow with `client_id`/`client_secret` |
| Webpack / esbuild bundling | Skills are installed by copying a directory. A bundled output breaks the "edit and reload" developer experience and makes the skill opaque. | Plain `.mjs` scripts with explicit imports from `node_modules` at a well-known path, or zero-dependency scripts |
| `cli-table` (original, Automattic) | Unmaintained. Superseded by `cli-table3`. | `cli-table3` |
| React/Ink for terminal UI | Ink is powerful for interactive TUIs but requires JSX compilation. The dashboard is a read-only display — a table library is sufficient. | `cli-table3` + `chalk` |
| Storing tokens in `.env` files | `.env` files are frequently committed to version control by mistake. For OAuth tokens that grant access to health data, this is unacceptable. | `conf` storing in the user's home config directory |

## Stack Patterns by Variant

**For the OAuth2 authorization code flow:**
- Spin up a temporary Python `http.server` on a random port (8080–8090)
- Open the Oura authorization URL in the browser with `open`
- Capture the `?code=` parameter in the callback handler
- Exchange code for tokens at `https://api.ouraring.com/oauth/token` via `fetch`
- Store access token + refresh token + expiry in `conf`
- Kill the Python server process

**For daily dashboard display:**
- Fetch from 3–5 endpoints in parallel with `Promise.all()`
- Format results into `cli-table3` rows
- Color-code scores with `chalk` (≥85 green, 70–84 yellow, <70 red)
- Print to stdout — Claude Code reads stdout and renders in the conversation

**For natural-language queries:**
- The skill's `SKILL.md` instructs Claude to call the bundled data-fetch scripts
- Claude interprets the results and answers the user's question in natural language
- No NLP library needed — Claude IS the NLP layer

**For token refresh:**
- Check expiry before every API call in the fetch helper script
- If expired or within 60 seconds of expiry, call the refresh endpoint
- Update stored tokens with `conf.set()`

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `chalk` 5.x | Node.js 14.16+ | ESM only — scripts must use `.mjs` or `"type": "module"` in package.json |
| `conf` 15.x | Node.js 18+ | Uses native ESM; requires `"type": "module"` |
| `open` 10.x | Node.js 18+ | ESM only |
| `cli-table3` 0.6.x | Node.js 6+ (any) | CommonJS — compatible with both CJS and ESM consumers via dynamic import if needed |
| Node.js built-in `fetch` | Node.js 18+ (stable in v21+) | Fully stable in v22 LTS. On v18/v20, use `--experimental-fetch` flag or polyfill if needed. |

## Oura API Reference

| Detail | Value |
|--------|-------|
| Authorization endpoint | `https://cloud.ouraring.com/oauth/authorize` |
| Token endpoint | `https://api.ouraring.com/oauth/token` |
| API base | `https://api.ouraring.com/v2` |
| Scopes | `email`, `personal`, `daily`, `heartrate`, `workout`, `tag`, `session`, `spo2` |
| PKCE support | Not documented — use standard Authorization Code with `client_secret` |
| Rate limit | ~5000 requests per 5-minute window (unofficial; no hard documented limit in v2 docs) |
| Sandbox | `https://api.ouraring.com/sandbox` for development without real account data |
| Redirect URI requirement | Must exactly match URI registered in Developer Dashboard |
| Note on endpoints | Authorization is on `cloud.ouraring.com`; token exchange and all data calls are on `api.ouraring.com` (different subdomain) |

## Sources

- [Claude Code Skills documentation](https://code.claude.com/docs/en/skills) — skill structure, frontmatter, script bundling, distribution patterns (HIGH confidence — official docs, fetched 2026-03-21)
- [Oura authentication docs](https://cloud.ouraring.com/docs/authentication) — OAuth2 flows, scopes, endpoints (HIGH confidence — official, fetched 2026-03-21)
- [Oura OAuth2 Authorization Code Grant](https://developer.ouraring.com/docs/oauth2/oauth2-authorization-code-grant) — flow details (404 on fetch; supplemented by authentication page — MEDIUM confidence)
- [Pinta365/oura_api GitHub](https://github.com/Pinta365/oura_api) — TypeScript reference implementation showing OAuth2 flow, endpoint coverage, v1.0.6 (MEDIUM confidence — community library, not official)
- [Axios vs Fetch 2025 — LogRocket](https://blog.logrocket.com/axios-vs-fetch-2025/) — HTTP client comparison (MEDIUM confidence — verified against multiple sources)
- [sindresorhus/conf GitHub](https://github.com/sindresorhus/conf) — encryption support, version, CLI config storage (MEDIUM confidence — official repo)
- [atom/node-keytar GitHub](https://github.com/atom/node-keytar) — archived status confirmed December 2022 (HIGH confidence — official repo)
- [cli-table3 npm](https://www.npmjs.com/package/cli-table3) — 4566 dependents, maintained fork (MEDIUM confidence)
- [npm-compare: cli-table variants](https://npm-compare.com/cli-table,cli-table3,console-table-printer,table,text-table) — comparative download and maintenance status (MEDIUM confidence)

---
*Stack research for: Claude Code skill — Oura Ring API v2 health dashboard*
*Researched: 2026-03-21*
