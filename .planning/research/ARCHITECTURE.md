# Architecture Research

**Domain:** Claude Code skill wrapping a third-party read-only REST API (Oura Ring API v2)
**Researched:** 2026-03-21
**Confidence:** HIGH (skill structure from official docs; Oura OAuth from official docs; credential patterns from community verification)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     User / Claude Code Session                   │
│   /oura-dashboard        /oura [natural language query]          │
├─────────────────────────────────────────────────────────────────┤
│                       Skill Layer (.claude/skills/)              │
│  ┌──────────────────┐  ┌───────────────────────────────────┐    │
│  │  SKILL.md        │  │  Supporting files                 │    │
│  │  (entry point,   │  │  - endpoints.md (API reference)   │    │
│  │   frontmatter,   │  │  - format-guide.md (output style) │    │
│  │   instructions)  │  │  - examples/ (sample outputs)     │    │
│  └────────┬─────────┘  └───────────────────────────────────┘    │
├───────────┼─────────────────────────────────────────────────────┤
│           │              Script Layer (scripts/)                 │
│           │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│           └─►│  auth.ts    │  │  client.ts   │  │ format.ts │  │
│              │  OAuth2     │  │  API calls   │  │ Markdown  │  │
│              │  token mgmt │  │  + retry     │  │ formatter │  │
│              └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
├─────────────────────┼────────────────┼────────────────┼─────────┤
│                     │    State Layer │                │          │
│              ┌──────▼──────┐  ┌──────▼──────┐        │          │
│              │ ~/.config/  │  │ Oura API v2 │        │          │
│              │ oura-skill/ │  │ (HTTPS)     │        │          │
│              │ tokens.json │  └─────────────┘        │          │
│              └─────────────┘                          │          │
├───────────────────────────────────────────────────────▼─────────┤
│                      Claude Conversation Context                 │
│              (formatted health summary returned here)            │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `SKILL.md` | Entry point; frontmatter declares name, description, allowed-tools, invocation control; body provides Claude instructions | YAML + Markdown; ~200-400 lines max |
| `scripts/auth.ts` | OAuth2 PKCE flow initiation, authorization code exchange, token refresh, token read/write to disk | TypeScript CLI; uses Node `http` for local callback server during first-time auth |
| `scripts/client.ts` | Authenticated HTTP GET to Oura API v2 endpoints; rate-limit backoff; error normalization | TypeScript; uses `fetch` or `node-fetch`; JSON output to stdout |
| `scripts/format.ts` | Converts raw Oura JSON into human-readable markdown summaries | TypeScript; pure data transformation |
| `tokens.json` | Persists access token, refresh token, expiry timestamp, and granted scopes between sessions | JSON file at `~/.config/oura-skill/tokens.json`; chmod 600 |
| `endpoints.md` | Reference doc for Claude listing all supported Oura API v2 endpoints, params, and data shapes | Supporting file; loaded by Claude on demand |
| `format-guide.md` | Style rules for how Claude presents health data (dashboard layout, trend language, metric formatting) | Supporting file; loaded by Claude on demand |

## Recommended Project Structure

```
agent-oura/
├── .claude/
│   └── skills/
│       └── oura/
│           ├── SKILL.md                  # Entry point (required)
│           ├── endpoints.md              # API reference for Claude
│           ├── format-guide.md           # Output style guide for Claude
│           ├── examples/
│           │   ├── dashboard-output.md   # Sample dashboard render
│           │   └── query-output.md       # Sample NL query response
│           └── scripts/
│               ├── auth.ts               # OAuth2 flow + token management
│               ├── client.ts             # Oura API HTTP client
│               ├── format.ts             # Data formatter (JSON -> Markdown)
│               ├── package.json          # Node deps (no framework needed)
│               ├── tsconfig.json
│               └── types.ts              # Oura API response type definitions
├── .planning/
│   └── research/
└── README.md
```

### Structure Rationale

- **`.claude/skills/oura/`:** Skill directory follows the Claude Code open standard (agentskills.io). Placing it in `.claude/` in the project root means it deploys as a project-scoped skill. Distributing via plugin or personal scope is a later step.
- **`scripts/`:** All executable logic lives here. Claude orchestrates the scripts via Bash tool calls; scripts output to stdout; Claude reads stdout and composes responses. This keeps Claude's instructions in natural language while keeping code in TypeScript.
- **`endpoints.md` + `format-guide.md`:** Referenced from SKILL.md but not auto-loaded — Claude reads them when needed, keeping the base context footprint small.
- **`~/.config/oura-skill/tokens.json`:** Token file lives outside the skill directory to avoid accidental version control exposure and to persist across skill reinstalls. Directory is user-owned with 700 permissions; file is 600.

## Architectural Patterns

### Pattern 1: Script-Mediated API Access

**What:** Claude does not make HTTP calls directly. Instead, SKILL.md instructs Claude to invoke shell scripts (via the Bash tool). Scripts execute API calls, write JSON results to stdout, and Claude reads stdout to compose answers.

**When to use:** Any skill that calls external APIs. Keeps auth secrets out of Claude's reasoning context. Scripts can be tested independently.

**Trade-offs:** Requires TypeScript/Node runtime on the user's machine. Adds ~50-100ms script startup overhead per call. Benefit: debuggable, unit-testable, separates concerns cleanly.

**Example:**
```typescript
// scripts/client.ts — invoked by Claude as:
// npx tsx ${CLAUDE_SKILL_DIR}/scripts/client.ts daily_sleep --start 2026-03-14 --end 2026-03-21

import { readTokens } from './auth.js';

const [endpoint, ...flags] = process.argv.slice(2);
const params = parseFlags(flags); // { start: '2026-03-14', end: '2026-03-21' }
const tokens = await readTokens();

const url = new URL(`https://api.ouraring.com/v2/usercollection/${endpoint}`);
for (const [k, v] of Object.entries(params)) url.searchParams.set(k === 'start' ? 'start_date' : 'end_date', v);

const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
if (!res.ok) { process.stderr.write(`API error: ${res.status}\n`); process.exit(1); }
process.stdout.write(JSON.stringify(await res.json(), null, 2));
```

### Pattern 2: File-Based Token Persistence

**What:** OAuth2 tokens (access token, refresh token, expiry) are stored in a user-local JSON file with restricted file permissions. Before each API call, `auth.ts` reads the file, checks expiry, and refreshes if needed. After refresh, tokens are written back atomically.

**When to use:** Any skill that requires OAuth2. The Oura refresh token is single-use — losing it means re-authenticating from scratch.

**Trade-offs:** File is plaintext (not keychain-backed). Mitigated by 600 permissions and storing outside the repo. For higher security, a future phase can use the OS keychain via `keytar`.

**Example:**
```typescript
// scripts/auth.ts (token read/refresh logic)
const TOKEN_PATH = path.join(os.homedir(), '.config', 'oura-skill', 'tokens.json');

export async function readTokens(): Promise<TokenSet> {
  const raw = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
  if (Date.now() >= raw.expires_at - 60_000) {
    return refreshAndSave(raw.refresh_token);
  }
  return raw;
}

async function refreshAndSave(refreshToken: string): Promise<TokenSet> {
  const res = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken,
      client_id: process.env.OURA_CLIENT_ID!, client_secret: process.env.OURA_CLIENT_SECRET! }),
  });
  // Oura refresh tokens are single-use — must save immediately
  const tokens = await res.json();
  await atomicWrite(TOKEN_PATH, tokens);
  return tokens;
}
```

### Pattern 3: Dual-Mode Skill Invocation

**What:** The skill serves two distinct user intents from one SKILL.md entry point. Direct invocation `/oura` (or `/oura-dashboard`) renders a formatted daily summary. Natural-language invocation (Claude auto-loads when user asks about health data) handles open-ended queries.

**When to use:** When a skill has both a fixed report mode and an exploratory query mode. Avoids creating two separate skills that share all the same scripts.

**Trade-offs:** SKILL.md instructions need clear conditional logic ("if user invokes directly, render dashboard; if user asks a question, query the relevant endpoints"). Keep these branches clearly separated in SKILL.md with headers.

**Example frontmatter:**
```yaml
---
name: oura
description: >
  Access Oura Ring health data. Renders a daily health dashboard when
  invoked directly. Auto-activates for questions about sleep, readiness,
  activity, heart rate, stress, or workout data.
allowed-tools: Bash(npx tsx *)
argument-hint: "[date: YYYY-MM-DD | 'today' | 'yesterday' | 'this week']"
---
```

## Data Flow

### First-Time Authentication Flow

```
User runs /oura for the first time
    |
    v
SKILL.md detects no token file
    |
    v
Claude invokes: npx tsx scripts/auth.ts init
    |
    v
auth.ts starts local HTTP server on :8765
auth.ts opens browser to Oura authorize URL
    |
    v
User logs in to Oura, grants scopes
    |
    v
Oura redirects to http://localhost:8765/callback?code=XXX
auth.ts exchanges code for access + refresh tokens
auth.ts writes ~/.config/oura-skill/tokens.json (mode 600)
    |
    v
Claude confirms auth complete, proceeds to fetch data
```

### Dashboard Request Flow

```
User: /oura  (or /oura today)
    |
    v
SKILL.md loads into Claude context
    |
    v
Claude invokes scripts in parallel:
    npx tsx scripts/client.ts daily_sleep --start TODAY
    npx tsx scripts/client.ts daily_readiness --start TODAY
    npx tsx scripts/client.ts daily_activity --start TODAY
    npx tsx scripts/client.ts daily_stress --start TODAY
    |
    v
Each script: readTokens() -> auto-refresh if expired -> GET /v2/usercollection/{endpoint}
    |
    v
JSON responses piped to stdout, collected by Claude
    |
    v
Claude calls: npx tsx scripts/format.ts dashboard < combined-data.json
  (or Claude formats inline using format-guide.md instructions)
    |
    v
Claude renders formatted markdown dashboard to user
```

### Natural Language Query Flow

```
User: "How did I sleep this week compared to last week?"
    |
    v
Claude auto-loads oura skill (description matches)
    |
    v
Claude determines: needs daily_sleep for 2 weeks, needs trend analysis
    |
    v
Claude invokes: npx tsx scripts/client.ts daily_sleep --start -14d --end today
    |
    v
Script fetches 14 days of sleep data, returns JSON
    |
    v
Claude analyzes data inline using reasoning, formats comparative answer
    |
    v
User receives narrative response with specific metrics and trend observations
```

### Key Data Flows Summary

1. **Auth tokens:** disk -> `auth.ts` -> memory (per script invocation). Never passed through Claude's reasoning context.
2. **API credentials (client_id/secret):** environment variables only (`OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`). Set by user during setup; never in skill files.
3. **Health data:** Oura API -> `client.ts` stdout -> Claude context -> formatted response. Data is ephemeral in Claude's context; not persisted.
4. **Refresh token lifecycle:** single-use per Oura spec. `auth.ts` writes new token immediately after refresh before doing anything else.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user | Current architecture is correct. All local. |
| Team / shared install | Plugin distribution via `.claude/plugins/` + setup script for credentials. Each user runs `auth.ts init` with their own Oura account. Client ID/secret shared via team secrets manager. |
| Public distribution | Publish as npm package or Claude plugin registry. Provide Oura app credentials OR instruct users to register their own Oura developer app. |

### Scaling Priorities

1. **First bottleneck:** Oura API rate limits. The API is read-heavy but limits apply per-token. Add response caching to `client.ts` (5-minute TTL for today's data, 24-hour TTL for historical). Mitigation: cache in `~/.config/oura-skill/cache/`.
2. **Second bottleneck:** Parallel endpoint calls on slow connections. Mitigation: `Promise.all()` in scripts, or have Claude invoke multiple scripts in parallel Bash calls.

## Anti-Patterns

### Anti-Pattern 1: Storing Tokens in the Skill Directory

**What people do:** Write `tokens.json` inside `.claude/skills/oura/` for convenience.
**Why it's wrong:** The skill directory is committed to version control. Tokens get pushed to GitHub. Access token exposed; refresh token exposed (Oura tokens are long-lived by default).
**Do this instead:** Store tokens in `~/.config/oura-skill/tokens.json` (outside repo, outside skill dir). Add `.claude/skills/oura/tokens.json` to `.gitignore` as a safety net even if not used.

### Anti-Pattern 2: Hardcoding Client Secret in SKILL.md or Scripts

**What people do:** Embed `OURA_CLIENT_SECRET=abc123` directly in a script or SKILL.md for ease of setup.
**Why it's wrong:** SKILL.md is designed to be shared and committed. Any hardcoded secret becomes a distributed credential. If the skill is published, the secret is public.
**Do this instead:** Read client credentials from environment variables (`process.env.OURA_CLIENT_ID`, `process.env.OURA_CLIENT_SECRET`). Document that users must export these in their shell profile. If distributing publicly, instruct users to register their own Oura developer application.

### Anti-Pattern 3: Monolithic SKILL.md with All API Documentation Inline

**What people do:** Paste all Oura endpoint documentation directly into SKILL.md so Claude always has it available.
**Why it's wrong:** SKILL.md descriptions count against Claude's skill context budget (approximately 2% of context window across all skills). A 3,000-line SKILL.md pre-empts that budget and slows every session, even when Oura is not relevant.
**Do this instead:** Keep SKILL.md under 400 lines. Move endpoint reference to `endpoints.md` and reference it: "For full endpoint details, see [endpoints.md](endpoints.md)." Claude loads it only when needed.

### Anti-Pattern 4: Not Handling Single-Use Refresh Tokens

**What people do:** Ignore refresh token rotation, assuming the old refresh token still works after a failed refresh.
**Why it's wrong:** Oura refresh tokens are single-use. If a refresh attempt partially fails (network timeout after token issuance), retrying with the same token fails. The old token is invalid; the new one may be lost.
**Do this instead:** Write the new token pair to disk atomically (write to temp file, then rename) before using the access token. If the write fails, surface a clear error asking user to re-authenticate rather than silently retrying with stale tokens.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Oura API v2 (`api.ouraring.com`) | HTTPS GET, Bearer token auth, JSON response | All endpoints read-only. `start_date`/`end_date` (YYYY-MM-DD) for daily metrics; `start_datetime`/`end_datetime` (ISO 8601) for heart rate |
| Oura OAuth server (`cloud.ouraring.com`) | Authorization Code flow with PKCE; local callback server on `:8765` | Refresh token is single-use. Token endpoint: `https://api.ouraring.com/oauth/token` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| SKILL.md <-> scripts/ | Claude invokes scripts via Bash tool; reads stdout | Scripts must exit with code 0 on success, non-zero on error. Errors to stderr; data to stdout |
| auth.ts <-> client.ts | `auth.ts` exports `readTokens()`; `client.ts` imports it | Both are TypeScript modules; compiled or run via `tsx` |
| client.ts <-> Oura API | HTTPS GET with `Authorization: Bearer` header | Must check `expires_at` before every call; refresh inline if needed |
| scripts/ <-> token file | File I/O at `~/.config/oura-skill/tokens.json` | Atomic writes (temp + rename). Permissions: dir 700, file 600 |
| Claude <-> endpoints.md | Claude reads file via Read tool when determining which endpoints to call | File is loaded on-demand, not preloaded |

## Build Order (Phase Implications)

The component dependency graph dictates this build sequence:

1. **Token storage + OAuth2 flow** (`auth.ts`) — Everything depends on authentication. Build and validate the full OAuth2 round-trip (authorize -> exchange -> store -> refresh) before writing any API client code.

2. **API client** (`client.ts`) — Once tokens work, wire up authenticated GET calls for 2-3 endpoints (daily_sleep, daily_readiness, daily_activity). Validate response shapes against types.

3. **Type definitions** (`types.ts`) — Derive from actual API responses. Do not write types speculatively from docs; Oura's spec has diverged from actual responses in the past.

4. **Data formatter** (`format.ts` / `format-guide.md`) — Once real data flows through, design the formatted output. Format decisions require seeing real data with real values.

5. **SKILL.md + dashboard mode** — Wire up the full dashboard flow with working scripts. Iterate on instructions until Claude correctly orchestrates parallel endpoint calls.

6. **Natural language query mode** — Build on top of working dashboard. Expand `endpoints.md` to cover all supported endpoints. Test with a range of query types.

7. **Distribution packaging** — Setup script, installation instructions, credential configuration guide. Last because the packaging story depends on stable internals.

## Sources

- [Claude Code Skills official documentation](https://code.claude.com/docs/en/skills) — SKILL.md structure, frontmatter reference, supporting files, `${CLAUDE_SKILL_DIR}` substitution (HIGH confidence)
- [Oura API v2 official docs](https://cloud.ouraring.com/v2/docs) — Endpoint list, response shapes (HIGH confidence)
- [Oura OAuth2 authentication docs](https://cloud.ouraring.com/docs/authentication) — Authorization URL, token exchange, single-use refresh token behavior (HIGH confidence)
- [pinta365/oura-api TypeScript client on JSR](https://jsr.io/@pinta365/oura-api/doc) — OAuth2 method signatures, available scopes, response model structure (MEDIUM confidence — third-party but well-maintained)
- [Claude Code authentication docs](https://code.claude.com/docs/en/authentication) — Credential storage patterns on macOS/Linux (`~/.claude/.credentials.json`, keychain) (HIGH confidence)
- WebSearch community findings on credential management patterns for Claude Code skills (MEDIUM confidence — consistent across multiple sources)

---
*Architecture research for: Claude Code skill wrapping Oura Ring API v2*
*Researched: 2026-03-21*
