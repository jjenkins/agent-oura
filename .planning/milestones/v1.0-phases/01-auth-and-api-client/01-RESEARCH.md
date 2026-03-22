# Phase 1: Auth and API Client - Research

**Researched:** 2026-03-21
**Domain:** OAuth2 Authorization Code Flow, token persistence, authenticated HTTP client, error handling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use a local HTTP server on a fixed port (e.g., 8910) to catch the OAuth callback — smoothest UX, predictable redirect URI
- **D-02:** Auto-open the browser with the auth URL; if browser open fails, print the URL for manual copy
- **D-03:** Request all scopes upfront at first auth: `personal daily heartrate workout tag session spo2` — cannot add scopes later without re-auth
- **D-04:** 2-minute timeout on the callback server; if timed out, show clear message to retry
- **D-05:** After receiving tokens, validate by calling `/v2/usercollection/personal_info` — show "Authenticated as [name]" on success
- **D-06:** Browser shows "Success, return to terminal" page; terminal shows the real confirmation with user name
- **D-07:** Single account only — one set of tokens, re-running auth overwrites existing tokens
- **D-08:** On timeout, show "Auth timed out. Run /oura auth to try again." — no Ctrl+C handling needed
- **D-09:** Do not show granted scopes after auth — just confirm identity
- **D-10:** Shared Oura developer app — client_id and client_secret are embedded in the skill code
- **D-11:** Embedded client_secret is acceptable (common pattern for open-source CLI tools like Spotify CLI)
- **D-12:** Zero config for end users — install skill, run `/oura auth`, done
- **D-13:** Tokens stored at `~/.oura/tokens.json` — simple dotfile path, outside the skill directory
- **D-14:** File permissions set to 0600 (owner read/write only)
- **D-15:** Plain JSON format: `{ access_token, refresh_token, expires_at }` — easy to debug if needed
- **D-16:** Atomic writes for token persistence: write to temp file, then rename — critical for single-use refresh tokens
- **D-17:** Provide a status command showing: authenticated as [name], token expiry, connection status

### Claude's Discretion

- Callback server language (Node.js built-in http or Python http.server)
- Whether to support env var overrides for client_id/client_secret (power user option)
- Error message verbosity and formatting for 401/403/429 responses
- Retry strategy details for rate limiting (backoff timing, max retries)
- Whether to show a welcome message on first run before auth

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can authenticate via OAuth2 flow with Oura API | OAuth2 Authorization Code flow documented; callback server patterns, state param, token exchange all verified |
| AUTH-02 | User tokens persist across Claude Code sessions in secure local storage | `~/.oura/tokens.json` with 0600 perms; plain JSON `{ access_token, refresh_token, expires_at }` pattern verified |
| AUTH-03 | Expired access tokens auto-refresh using stored refresh token | Oura token endpoint supports `grant_type: refresh_token`; expiry check pattern documented |
| AUTH-04 | Single-use refresh tokens are atomically persisted on each refresh | Oura confirms single-use refresh tokens; temp-file-then-rename pattern documented; `write-file-atomic` 7.0.1 available |
| ERR-01 | Rate limit (429) responses are handled with retry logic and user feedback | 5000 req/5-min Oura limit; exponential backoff pattern; RFC7807 detail field for error messages |
| ERR-02 | Auth errors (401/403) trigger auto-refresh or clear re-auth instructions | 401 = try refresh; second 401 = prompt re-auth; 403 Membership gate requires separate message |
| ERR-03 | Missing data scenarios show helpful messages (sync delay, membership required) | 403 for no membership; empty arrays for unsynced data; 426 for outdated app — all require distinct handling |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire auth and API client foundation that every subsequent phase builds on. The work falls into three tightly coupled sub-systems: (1) a one-shot OAuth2 callback server that captures the authorization code and exchanges it for tokens, (2) an atomic token persistence layer at `~/.oura/tokens.json` that handles the single-use refresh token constraint without data loss, and (3) an authenticated HTTP client with structured error handling for all Oura API error scenarios.

The locked decisions remove most ambiguity. The port is 8910, the scope list is complete, storage is `~/.oura/tokens.json` with 0600 perms, and writes are atomic. The key implementation choices left to discretion are: which runtime handles the callback server (Node.js `http` module is recommended over Python — same zero-dependency story, better integration with the rest of the skill's .mjs scripts), whether to expose env var overrides for the embedded client credentials (recommended: yes, for power users), and the exact retry timing for 429 responses (recommended: exponential backoff, max 3 retries, starting at 1 second).

The most dangerous failure mode in this phase is losing a single-use refresh token between receiving it from Oura's token endpoint and persisting it to disk. The atomic write pattern (write to `~/.oura/tokens.json.tmp`, then `fs.rename()`) prevents this. All other complexity — error classification, retry logic, browser launch — is secondary to getting this right.

**Primary recommendation:** Use Node.js built-in `http` module for the callback server (same runtime as the rest of the scripts, zero added dependencies), `fs.rename()` for atomic token writes (no extra package needed for a two-file operation), and native `fetch` throughout. Add `open` (v11.0.0) for browser launch and keep the callback server under 60 lines.

---

## Standard Stack

### Core (Phase 1 scope)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `http` | v22 LTS | OAuth callback server on port 8910 | Zero dependency; sufficient for a single-route server that runs for < 2 minutes; integrates natively with .mjs scripts |
| Node.js built-in `fetch` | v22 LTS (stable) | Token exchange POST, token refresh POST, personal_info GET | Stable in v22; no external dep; handles all Oura API calls this phase needs |
| Node.js built-in `fs/promises` | v22 LTS | Token file read/write; atomic rename | `fs.rename()` is atomic on same-filesystem; `writeFile` + `rename` is the standard temp-then-rename pattern |
| Node.js built-in `crypto` | v22 LTS | Generate OAuth state parameter (CSRF protection) | `crypto.randomBytes(16).toString('hex')` — no library needed |
| `open` | 11.0.0 | Cross-platform browser launch for OAuth URL | Standard CLI browser-open library; falls back gracefully when browser unavailable |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `write-file-atomic` | 7.0.1 | Atomic JSON write with fsync guarantees | Use if plain `writeFile`+`rename` is insufficient (e.g., filesystem doesn't guarantee rename atomicity across NFS/SMB). For local `~/.oura/` on macOS/Linux, plain `rename` suffices — this is an optional safety net |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js `http` callback server | Python `http.server` | Python is zero-dep and STACK.md mentions it, but Node.js `http` keeps everything in the same runtime. Decision: use Node.js — avoids spawning a second language process |
| `fs.rename()` atomic write | `write-file-atomic` npm package | `write-file-atomic` adds fsync safety for NFS/networked volumes; for local home directories on macOS/Linux, plain rename is atomic. Decision: use plain rename; document `write-file-atomic` as upgrade path if portability issues arise |
| Native `fetch` | `axios` | Axios adds interceptors (useful for auto-refresh) but costs 11.7kB and a dependency. For this phase's small surface, native fetch with explicit refresh logic is cleaner |

**Installation:**
```bash
# Minimum for Phase 1 — open is the only external dependency
npm install open

# Optional safety net for atomic writes on networked volumes
# npm install write-file-atomic
```

**Version verification (confirmed 2026-03-21):**
- `open`: 11.0.0 (latest)
- `write-file-atomic`: 7.0.1 (latest)
- `conf`: 15.1.0 (latest) — not used this phase; token path is `~/.oura/tokens.json` per D-13, not `~/.config/`. Plain `fs` is sufficient.

---

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
agent-oura/
├── .claude/
│   └── skills/
│       └── oura/
│           ├── SKILL.md                  # Entry point (Phase 1: auth detection + /oura auth)
│           └── scripts/
│               ├── auth.mjs              # OAuth2 flow + token read/write + refresh
│               ├── client.mjs            # Authenticated HTTP client + error handling
│               └── package.json          # { "type": "module", "dependencies": { "open": "^11.0.0" } }
└── .planning/
```

### Pattern 1: OAuth2 Callback Server (Node.js http)

**What:** A temporary HTTP server on port 8910 that captures the `?code=` query param from Oura's redirect, exchanges it for tokens, writes tokens to disk, then shuts down.

**When to use:** Initial auth and re-auth flows.

**Example:**
```javascript
// scripts/auth.mjs — initAuth()
// Source: Node.js http docs + dev.to/koistya pattern (verified 2026-03-21)
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import open from 'open';

const PORT = 8910;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const TIMEOUT_MS = 120_000; // D-04: 2-minute timeout

export async function initAuth(clientId, clientSecret) {
  const state = randomBytes(16).toString('hex');

  const authUrl = new URL('https://cloud.ouraring.com/oauth/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', 'personal daily heartrate workout tag session spo2');
  authUrl.searchParams.set('state', state);

  const code = await waitForCallback(state);
  const tokens = await exchangeCode(code, clientId, clientSecret);
  await saveTokens(tokens);

  // D-05: validate by calling personal_info
  const userInfo = await fetchPersonalInfo(tokens.access_token);
  return userInfo.age ? userInfo : { name: 'Unknown' }; // surface name for "Authenticated as X"
}

function waitForCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') return res.end();

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      // Respond to browser first (D-06)
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Success — return to terminal.</h2></body></html>');

      server.close();
      clearTimeout(timer);

      if (state !== expectedState) return reject(new Error('State mismatch — possible CSRF'));
      if (!code) return reject(new Error('No code in callback'));
      resolve(code);
    });

    server.listen(PORT);

    // D-02: open browser, fall back to printing URL
    const url = buildAuthUrl(expectedState);
    open(url.toString()).catch(() => {
      process.stderr.write(`Open browser to: ${url}\n`);
    });

    // D-04: 2-minute timeout
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('TIMEOUT'));
    }, TIMEOUT_MS);
  });
}
```

### Pattern 2: Atomic Token Write (temp + rename)

**What:** Write tokens to a `.tmp` file then `fs.rename()` to the final path. On POSIX systems, `rename()` is atomic within the same filesystem. Prevents partial writes from corrupting the token file and losing the single-use refresh token.

**When to use:** Every time tokens are written — initial save and every refresh.

**Example:**
```javascript
// scripts/auth.mjs — saveTokens()
// Source: Node.js fs docs, PITFALLS.md Pitfall 2
import { writeFile, rename, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TOKEN_DIR = join(homedir(), '.oura');
const TOKEN_PATH = join(TOKEN_DIR, 'tokens.json');
const TOKEN_TMP = join(TOKEN_DIR, 'tokens.json.tmp');

export async function saveTokens(tokenResponse) {
  // tokenResponse from Oura: { access_token, refresh_token, expires_in, token_type }
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    // D-15: store expires_at as absolute epoch ms
    expires_at: Date.now() + tokenResponse.expires_in * 1000,
  };

  await mkdir(TOKEN_DIR, { recursive: true });
  // Write to temp first (D-16)
  await writeFile(TOKEN_TMP, JSON.stringify(tokens, null, 2), 'utf8');
  // Atomic rename — POSIX guarantees this is atomic on same filesystem
  await rename(TOKEN_TMP, TOKEN_PATH);
  // D-14: 0600 permissions
  await chmod(TOKEN_PATH, 0o600);
}
```

### Pattern 3: Token Read with Inline Refresh

**What:** Before every API call, read the token file, check `expires_at` against `Date.now()`, and refresh atomically if within 60 seconds of expiry. The new refresh token is persisted before the access token is used.

**When to use:** Wrap in `readTokens()` called at the top of every `client.mjs` operation.

**Example:**
```javascript
// scripts/auth.mjs — readTokens()
import { readFile } from 'node:fs/promises';

export async function readTokens() {
  let raw;
  try {
    raw = JSON.parse(await readFile(TOKEN_PATH, 'utf8'));
  } catch {
    throw new Error('NOT_AUTHENTICATED'); // signal to caller
  }

  // Refresh if expired or within 60s of expiry
  if (Date.now() >= raw.expires_at - 60_000) {
    return refreshTokens(raw.refresh_token);
  }
  return raw;
}

async function refreshTokens(refreshToken) {
  const res = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error('REFRESH_FAILED');
  const tokens = await res.json();
  // CRITICAL: save BEFORE returning — single-use token must not be lost
  await saveTokens(tokens);
  return tokens;
}
```

### Pattern 4: Authenticated HTTP Client with Error Classification

**What:** A single `ouraGet(path, params)` function in `client.mjs` that reads tokens, attaches the Bearer header, and maps HTTP error codes to structured errors with clear user messages.

**When to use:** All Oura API data calls from Phase 2 onward import and use this function.

**Example:**
```javascript
// scripts/client.mjs — ouraGet()
// Source: PITFALLS.md Integration Gotchas + ARCHITECTURE.md Pattern 1
import { readTokens } from './auth.mjs';

const API_BASE = 'https://api.ouraring.com/v2';

export async function ouraGet(path, params = {}) {
  const tokens = await readTokens();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (res.ok) return res.json();

  // ERR-01: Rate limit
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    throw Object.assign(new Error('RATE_LIMITED'), { retryAfter });
  }
  // ERR-02: Auth errors
  if (res.status === 401) throw new Error('AUTH_EXPIRED');
  if (res.status === 403) {
    // Could be membership gate or scope issue — check body detail
    const body = await res.json().catch(() => ({}));
    const detail = body.detail ?? '';
    if (detail.toLowerCase().includes('membership')) throw new Error('MEMBERSHIP_REQUIRED');
    throw new Error('AUTH_FORBIDDEN');
  }
  // ERR-03: App version gate
  if (res.status === 426) throw new Error('APP_UPDATE_REQUIRED');

  throw Object.assign(new Error('API_ERROR'), { status: res.status });
}
```

### Pattern 5: Status Command

**What:** A `status` sub-command in `auth.mjs` that reads the token file, checks expiry, and optionally calls `/v2/usercollection/personal_info` to confirm live connection.

**When to use:** Invoked by SKILL.md when user runs `/oura status` (D-17).

```javascript
// scripts/auth.mjs — showStatus()
export async function showStatus() {
  try {
    const tokens = await readTokens();
    const expiresIn = Math.floor((tokens.expires_at - Date.now()) / 1000 / 60);
    const userInfo = await fetchPersonalInfo(tokens.access_token);
    process.stdout.write(JSON.stringify({
      authenticated: true,
      name: userInfo.email ?? 'Unknown',
      token_expires_in_minutes: expiresIn,
      connection: 'ok',
    }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ authenticated: false, reason: e.message }));
  }
}
```

### Anti-Patterns to Avoid

- **Using `conf` for token storage:** CONTEXT.md D-13 specifies `~/.oura/tokens.json`. Using `conf` would store tokens in `~/.config/oura-skill/` (platform-dependent path) and adds a dependency. Use plain `fs` to the locked path instead.
- **Skipping state parameter validation:** Even for a CLI tool, validate the state param returned in the callback matches the value sent in the auth URL. Prevents CSRF on shared machines.
- **Catching refresh errors and retrying with same refresh token:** Oura refresh tokens are single-use. If refresh returns a non-200, surface `AUTH_EXPIRED` immediately — do not retry with the old token.
- **Setting permissions before the atomic rename:** `chmod` must run AFTER `rename(tmp, final)`. If set on the `.tmp` file and rename fails, the final file retains its old permissions.
- **Binding the callback server to `0.0.0.0`:** Bind to `127.0.0.1` (localhost) only. Binding to all interfaces exposes the code-capture endpoint to the local network.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform browser launch | `exec('open ...')` / `exec('xdg-open ...')` / `exec('start ...')` per-platform | `open` 11.0.0 | `open` handles macOS, Linux, WSL, Windows, and fallback behavior — platform detection is non-trivial |
| OAuth state generation | `Math.random()` for CSRF token | `crypto.randomBytes(16).toString('hex')` | `Math.random()` is not cryptographically secure — state token must be unpredictable |
| URL query parameter parsing | Manual string split | `new URL(req.url, base)` + `.searchParams` | `URL` is built-in; manual parsing mishandles encoding and edge cases |

**Key insight:** The built-in Node.js v22 standard library (`http`, `fetch`, `crypto`, `fs/promises`, `URL`) handles every primitive needed for this phase. The only justified external dependency is `open` for cross-platform browser launch.

---

## Common Pitfalls

### Pitfall 1: Lost Refresh Token on Concurrent Invocations

**What goes wrong:** Two parallel script invocations both see an expired access token and both attempt to refresh. The first refresh succeeds and writes new tokens. The second refresh uses the now-invalidated old refresh token and fails. Depending on error handling, the user may be locked out.

**Why it happens:** Claude Code can invoke multiple scripts in parallel Bash calls. Token refresh is not mutex-protected.

**How to avoid:** Phase 1 doesn't need a full mutex (adds complexity). The mitigation is: check expiry conservatively (60s buffer), and if refresh fails with a 400/401, immediately surface `AUTH_EXPIRED` — user re-runs `/oura auth`. Document this in the status error message: "Token refresh failed — run /oura auth to re-authenticate."

**Warning signs:** Auth errors appearing immediately after a successful auth flow.

### Pitfall 2: Port 8910 Already in Use

**What goes wrong:** The callback server fails to bind to port 8910 because another process is using it. The auth flow hangs or crashes without a clear message.

**Why it happens:** Fixed port (D-01) means no fallback to a random open port.

**How to avoid:** Wrap `server.listen()` in an error handler. If `EADDRINUSE`, show: "Port 8910 is in use. Free the port and run /oura auth again." Redirect URI must match `http://localhost:8910/callback` exactly as registered in the Oura developer app — cannot use a different port without re-registering.

**Warning signs:** `Error: listen EADDRINUSE :::8910`

### Pitfall 3: Token File Created Before Directory Exists

**What goes wrong:** `writeFile(TOKEN_TMP, ...)` throws `ENOENT` because `~/.oura/` doesn't exist on first run.

**Why it happens:** `~/.oura/` is not created by default — this directory is only meaningful to this skill.

**How to avoid:** Call `mkdir(TOKEN_DIR, { recursive: true })` before every `saveTokens()`. The `recursive: true` flag makes this idempotent.

### Pitfall 4: Oura Dual-Subdomain Confusion

**What goes wrong:** Token exchange POST sent to `cloud.ouraring.com/oauth/token` instead of `api.ouraring.com/oauth/token`, or API data calls sent to `cloud.ouraring.com`.

**Why it happens:** Auth URL is on `cloud.ouraring.com`, so it's easy to assume the token endpoint is also there.

**How to avoid:** Hard-code constants clearly:
- `AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize'` (auth redirect, browser-facing)
- `TOKEN_URL = 'https://api.ouraring.com/oauth/token'` (server-to-server exchange AND refresh)
- `API_BASE = 'https://api.ouraring.com/v2'` (all data endpoints)

**Warning signs:** 404s on token exchange; "Not Found" on API calls to cloud subdomain.

### Pitfall 5: `expires_in` vs `expires_at` Storage Mismatch

**What goes wrong:** Oura returns `expires_in` (seconds from now). If stored as-is, the token appears expired on the next session because `expires_in` is relative to the time of issue, not an absolute timestamp.

**Why it happens:** D-15 specifies storing `expires_at` but Oura returns `expires_in`. Requires conversion at write time.

**How to avoid:** In `saveTokens()`, convert immediately: `expires_at = Date.now() + expires_in * 1000`. Never store `expires_in`.

### Pitfall 6: 403 Membership Gate vs. 403 Scope Error — Same Status Code

**What goes wrong:** A 403 from `/v2/usercollection/personal_info` could mean: (a) Oura Membership required, or (b) the `personal` scope was not granted. Treating both as "membership required" misleads the user.

**Why it happens:** HTTP 403 is overloaded in Oura's API.

**How to avoid:** Parse the RFC7807 `detail` field from the 403 body. If `detail` contains "membership", show the membership message. Otherwise, show a generic auth error and suggest re-running `/oura auth` to re-grant scopes.

---

## Code Examples

### OAuth2 Authorization URL Construction
```javascript
// Source: cloud.ouraring.com/docs/authentication (verified 2026-03-21)
const authUrl = new URL('https://cloud.ouraring.com/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', 'http://localhost:8910/callback');
authUrl.searchParams.set('scope', 'personal daily heartrate workout tag session spo2');
authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
// Result: https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id=...
```

### Token Exchange POST
```javascript
// Source: cloud.ouraring.com/docs/authentication (verified 2026-03-21)
const res = await fetch('https://api.ouraring.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: 'http://localhost:8910/callback',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }),
});
// Response: { token_type: 'bearer', access_token, expires_in (seconds), refresh_token }
```

### Token Refresh POST
```javascript
// Source: cloud.ouraring.com/docs/authentication — single-use refresh token confirmed
const res = await fetch('https://api.ouraring.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: storedRefreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }),
});
// Response includes new refresh_token — old one is immediately invalidated
```

### Personal Info Validation Call
```javascript
// D-05: validate tokens and retrieve user identity
// Endpoint: GET /v2/usercollection/personal_info
const res = await fetch('https://api.ouraring.com/v2/usercollection/personal_info', {
  headers: { Authorization: `Bearer ${access_token}` },
});
// Response includes: age, weight, height, biological_sex, email
// Use email or age presence to confirm auth success
```

### Exponential Backoff for 429
```javascript
// ERR-01: retry up to 3 times with exponential backoff
// Source: PITFALLS.md + Oura error-handling docs (5000 req/5-min window)
async function ouraGetWithRetry(path, params, attempt = 0) {
  try {
    return await ouraGet(path, params);
  } catch (err) {
    if (err.message === 'RATE_LIMITED' && attempt < 3) {
      const delay = Math.min(err.retryAfter * 1000 ?? 1000 * 2 ** attempt, 30_000);
      process.stderr.write(`Rate limited — retrying in ${delay / 1000}s...\n`);
      await new Promise(r => setTimeout(r, delay));
      return ouraGetWithRetry(path, params, attempt + 1);
    }
    throw err;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Oura Personal Access Tokens | OAuth2 Authorization Code | 2023 (Oura deprecation) | PATs no longer valid for new accounts; OAuth2 mandatory for distribution |
| `keytar` for OS keychain storage | Plain file with `0600` perms (`~/.oura/tokens.json`) | Dec 2022 (`keytar` archived) | keytar has native compilation issues on Apple Silicon; file-based is the safe default |
| `node-fetch` external dep for HTTP | Node.js v22 built-in `fetch` | Node.js v22 LTS (2024) | No external fetch dep needed; native fetch is stable |
| Python `http.server` for callback | Node.js built-in `http` module | Choice for this project | Same zero-dep story; avoids spawning a separate Python process alongside Node.js scripts |

**Deprecated/outdated:**
- `keytar` (atom/node-keytar): Archived December 2022. Do not use — Apple Silicon compilation failures.
- Oura PATs: Deprecated. New accounts may not have access. OAuth2 required.
- Oura v1 scope names (e.g., `spo2Daily`): Use v2 names (`spo2`, `heartrate`, etc.).

---

## Open Questions

1. **Can the embedded `client_secret` be accessed via source inspection by end users?**
   - What we know: D-10/D-11 explicitly accept this (common open-source CLI pattern, cited Spotify CLI)
   - What's unclear: Whether Oura's developer ToS has language about embedded secrets in open-source tools (research did not surface a policy)
   - Recommendation: Proceed with embedding per locked decision. Add env var override (`OURA_CLIENT_ID` / `OURA_CLIENT_SECRET`) as a power-user escape hatch — this costs nothing and gives enterprise users a way to use their own app registration.

2. **Does Oura's token endpoint return a new `refresh_token` on every token exchange, or only on refreshes?**
   - What we know: Official docs confirm refresh responses include a new `refresh_token`. Initial exchange docs show `access_token`, `expires_in`, and `refresh_token` in the response.
   - What's unclear: Whether the initial code exchange always returns a `refresh_token` (assumed yes based on standard OAuth2 + Oura's single-use documentation).
   - Recommendation: Test immediately with a real auth flow — log raw token exchange response to confirm all three fields are present before writing persistence logic.

3. **Concurrent refresh token race condition — is file locking needed?**
   - What we know: Claude Code can invoke multiple Bash tool calls in parallel.
   - What's unclear: Whether Phase 1's use patterns (single auth flow, status check) actually create concurrent refresh attempts.
   - Recommendation: Do not implement file locking in Phase 1 (adds complexity disproportionate to risk at this scale). Document the race as a known limitation. The 60-second expiry buffer plus the conservative `expires_at` check reduces collision probability significantly.

---

## Sources

### Primary (HIGH confidence)
- `https://cloud.ouraring.com/docs/authentication` — OAuth2 flow, token exchange params, response format, single-use refresh token confirmation (fetched 2026-03-21)
- `https://cloud.ouraring.com/v2/docs` — API base URL, endpoint list, error codes (referenced from PITFALLS.md)
- `.planning/research/STACK.md` — Technology decisions, Oura API endpoint constants, library version guidance (project artifact, 2026-03-21)
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, build order (project artifact, 2026-03-21)
- `.planning/research/PITFALLS.md` — Single-use refresh tokens, scope selection, error handling patterns (project artifact, 2026-03-21)
- Node.js v22 docs — `http`, `fetch`, `fs/promises`, `crypto` built-in capabilities

### Secondary (MEDIUM confidence)
- `https://dev.to/koistya/building-a-localhost-oauth-callback-server-in-nodejs-470c` — localhost callback server patterns with Node.js `http` (verified against Node.js docs)
- `https://www.npmjs.com/package/write-file-atomic` — version 7.0.1, atomic write mechanics (npm registry, 2026-03-21)
- `https://jsr.io/@pinta365/oura-api` — third-party TypeScript Oura client showing OAuth2 method signatures and scope names (community library)

### Tertiary (LOW confidence)
- WebSearch findings on OAuth2 state parameter validation — consistent with OWASP cheat sheet (multiple sources agreeing)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node.js v22 built-ins verified; `open` 11.0.0 version confirmed via npm; locked decisions eliminate ambiguity
- Architecture: HIGH — OAuth2 flow verified against official Oura docs; atomic write pattern is standard POSIX; callback server pattern verified
- Pitfalls: HIGH — single-use refresh token confirmed by official docs; dual-subdomain confirmed by official docs; port binding issue is standard Node.js behavior

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable APIs; Oura API v2 is production; Node.js v22 is LTS)
