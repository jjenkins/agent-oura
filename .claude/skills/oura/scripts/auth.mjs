// Oura OAuth2 authentication flow, token persistence, refresh, and status.
// Exports: initAuth, readTokens, saveTokens, showStatus

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile, readFile, rename, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import open from 'open';

// --- Constants ---

const PORT = 8910; // D-01: fixed port
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize'; // browser-facing (Pitfall 4)
const TOKEN_URL = 'https://api.ouraring.com/oauth/token'; // server-to-server (Pitfall 4)
const API_BASE = 'https://api.ouraring.com/v2';
const SCOPES = 'personal daily heartrate workout tag session spo2'; // D-03: all scopes upfront
const TIMEOUT_MS = 120_000; // D-04: 2-minute timeout
const TOKEN_DIR = join(homedir(), '.oura'); // D-13
const TOKEN_PATH = join(TOKEN_DIR, 'tokens.json');
const TOKEN_TMP = join(TOKEN_DIR, 'tokens.json.tmp'); // D-16: atomic write temp file
const CONFIG_PATH = join(homedir(), '.oura', 'config.json');

// --- Internal: Read OAuth credentials from config file or environment ---

async function readConfig() {
  // D-03: env vars override config file
  const envId = process.env.OURA_CLIENT_ID;
  const envSecret = process.env.OURA_CLIENT_SECRET;
  if (envId && envSecret) {
    return { client_id: envId, client_secret: envSecret };
  }

  let raw;
  try {
    raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    throw new Error('NOT_CONFIGURED');
  }

  if (!raw.client_id || !raw.client_secret) {
    throw new Error('NOT_CONFIGURED');
  }

  return { client_id: raw.client_id, client_secret: raw.client_secret };
}

// --- Internal: Build auth URL ---

function buildAuthUrl(state, config) {
  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  return authUrl;
}

// --- Internal: Wait for OAuth callback on port 8910 ---

function waitForCallback(expectedState, config) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

      // Only handle /callback — ignore all other paths
      if (url.pathname !== '/callback') {
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      // D-06: Respond to browser with success page; terminal shows real confirmation
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Success -- return to terminal.</h2></body></html>');

      server.close();
      clearTimeout(timer);

      if (state !== expectedState) {
        reject(new Error('State mismatch -- possible CSRF'));
        return;
      }
      if (!code) {
        reject(new Error('No authorization code received'));
        return;
      }
      resolve(code);
    });

    // D-02: handle server bind errors (Pitfall 2)
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 8910 is in use. Free the port and run /oura auth again.'));
      } else {
        reject(err);
      }
    });

    // Bind to 127.0.0.1 only — NOT 0.0.0.0 (anti-pattern: do not expose to local network)
    server.listen(PORT, '127.0.0.1', () => {
      const authUrl = buildAuthUrl(expectedState, config);

      // D-02: open browser, fall back to stderr URL print if browser unavailable
      open(authUrl.toString()).catch(() => {
        process.stderr.write(`Open this URL in your browser:\n${authUrl}\n`);
      });
    });

    // D-04: 2-minute timeout with user-friendly message (D-08)
    const timer = setTimeout(() => {
      server.close();
      const err = new Error('Auth timed out. Run /oura auth to try again.');
      reject(err);
    }, TIMEOUT_MS);
  });
}

// --- Internal: Exchange authorization code for tokens ---

async function exchangeCode(code, config) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: config.client_id,
      client_secret: config.client_secret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

// --- Internal: Refresh expired access token ---

async function refreshTokens(refreshToken) {
  const config = await readConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.client_id,
      client_secret: config.client_secret,
    }),
  });

  if (!res.ok) {
    // Do NOT retry with old token — single-use refresh token is now invalidated (Pitfall 1 anti-pattern)
    throw new Error('REFRESH_FAILED');
  }

  const newTokens = await res.json();

  // CRITICAL (AUTH-04): persist single-use refresh token to disk BEFORE returning
  await saveTokens(newTokens);

  return {
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token,
    expires_at: Date.now() + newTokens.expires_in * 1000,
  };
}

// --- Internal: Fetch personal info for identity confirmation ---

async function fetchPersonalInfo(accessToken) {
  const res = await fetch(`${API_BASE}/usercollection/personal_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Personal info fetch failed: ${res.status}`);
  }

  return res.json();
}

// --- Exported: saveTokens ---
// Atomically writes tokens to ~/.oura/tokens.json with 0600 permissions.
// D-15: converts expires_in (relative seconds) to expires_at (absolute epoch ms)
// D-16: write to temp file then atomic rename to prevent refresh token loss

export async function saveTokens(tokenResponse) {
  const tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    // Pitfall 5: convert expires_in (relative) to expires_at (absolute epoch ms)
    expires_at: Date.now() + tokenResponse.expires_in * 1000,
  };

  // Pitfall 3: ensure directory exists on first run
  await mkdir(TOKEN_DIR, { recursive: true });

  // D-16: atomic write — write to .tmp first, then rename
  await writeFile(TOKEN_TMP, JSON.stringify(tokens, null, 2), 'utf8');
  await rename(TOKEN_TMP, TOKEN_PATH); // POSIX atomic on same filesystem

  // D-14: set 0600 permissions AFTER rename (not on .tmp — anti-pattern)
  await chmod(TOKEN_PATH, 0o600);
}

// --- Exported: readTokens ---
// Reads tokens from disk. Transparently refreshes if within 60s of expiry.
// Throws 'NOT_AUTHENTICATED' if token file is missing or unparseable.

export async function readTokens() {
  let raw;
  try {
    raw = JSON.parse(await readFile(TOKEN_PATH, 'utf8'));
  } catch {
    throw new Error('NOT_AUTHENTICATED');
  }

  // Auto-refresh if expired or within 60s of expiry (AUTH-03)
  if (Date.now() >= raw.expires_at - 60_000) {
    return refreshTokens(raw.refresh_token);
  }

  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at,
  };
}

// --- Exported: initAuth ---
// Full OAuth2 authorization code flow. Opens browser, waits for callback,
// exchanges code for tokens, persists tokens, confirms identity.

export async function initAuth() {
  const config = await readConfig();
  const state = randomBytes(16).toString('hex');

  const code = await waitForCallback(state, config);
  const tokenResponse = await exchangeCode(code, config);
  await saveTokens(tokenResponse);

  // D-05: validate tokens by calling personal_info; show identity (D-09: email only, no scopes)
  const tokens = await readTokens();
  const userInfo = await fetchPersonalInfo(tokens.access_token);
  const identity = userInfo.email || userInfo.age?.toString() || null;
  const label = identity ? `Authenticated as ${identity}` : 'Authenticated successfully';

  process.stdout.write(`${label}\n`);

  return userInfo;
}

// --- Exported: showStatus ---
// D-17: outputs JSON to stdout with auth status, email, token expiry, connection status.

export async function showStatus() {
  try {
    const tokens = await readTokens();
    const expiresInMinutes = Math.floor((tokens.expires_at - Date.now()) / 60_000);
    const userInfo = await fetchPersonalInfo(tokens.access_token);

    process.stdout.write(JSON.stringify({
      authenticated: true,
      email: userInfo.email || null,
      token_expires_in_minutes: expiresInMinutes,
      connection: 'ok',
    }));
  } catch (err) {
    const reason = err.message === 'NOT_CONFIGURED'
      ? 'Credentials not configured. Run /oura setup to add your Oura client_id and client_secret.'
      : err.message;
    process.stdout.write(JSON.stringify({
      authenticated: false,
      reason,
    }));
  }
}

// --- CLI entry point ---

const command = process.argv[2];

if (command === 'auth') {
  initAuth().catch((err) => {
    process.stderr.write(`Auth failed: ${err.message}\n`);
    process.exit(1);
  });
} else if (command === 'status') {
  showStatus().catch((err) => {
    process.stderr.write(`Status check failed: ${err.message}\n`);
    process.exit(1);
  });
} else if (command !== undefined) {
  process.stderr.write(`Usage: node auth.mjs [auth|status]\n`);
  process.exit(1);
}
