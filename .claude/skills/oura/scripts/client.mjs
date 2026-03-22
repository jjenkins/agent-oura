// Oura API authenticated HTTP client with error classification and retry logic.
// Exports: ouraGet, ouraGetWithRetry, formatError

import { readTokens } from './auth.mjs';

// --- Constants ---

const API_BASE = 'https://api.ouraring.com/v2';
const MAX_RETRIES = 3;

// --- Exported: ouraGet ---
// Single authenticated GET request. Classifies HTTP errors into typed Error instances.
// Throws on any non-200 response; callers should use ouraGetWithRetry for retry logic.

export async function ouraGet(path, params = {}) {
  const tokens = await readTokens(); // auto-refreshes if near expiry

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (res.ok) {
    const json = await res.json();

    // ERR-03: Detect empty data arrays indicating data has not synced yet.
    // Oura returns 200 with {"data": []} when the ring hasn't uploaded data
    // for the requested period. Only flag responses that have a `data` key
    // that is an empty array — endpoints like /personal_info return objects
    // without a `data` key and should pass through unchanged.
    if (Array.isArray(json.data) && json.data.length === 0) {
      throw Object.assign(
        new Error('DATA_NOT_SYNCED'),
        { response: json }
      );
    }

    return json;
  }

  // --- Error classification ---

  // 429 -- Rate Limited (ERR-01)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    throw Object.assign(new Error('RATE_LIMITED'), { retryAfter });
  }

  // 401 -- Auth Expired (ERR-02)
  if (res.status === 401) {
    throw new Error('AUTH_EXPIRED');
  }

  // 403 -- Forbidden: membership gate vs scope error (ERR-02/ERR-03)
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const detail = (body.detail ?? '').toLowerCase();
    if (detail.includes('membership') || detail.includes('subscription')) {
      throw new Error('MEMBERSHIP_REQUIRED');
    }
    throw new Error('AUTH_FORBIDDEN');
  }

  // 426 -- Upgrade Required (ERR-03)
  if (res.status === 426) {
    throw new Error('APP_UPDATE_REQUIRED');
  }

  // All other HTTP errors
  const body = await res.text().catch(() => '');
  throw Object.assign(new Error('API_ERROR'), { status: res.status, body });
}

// --- Exported: ouraGetWithRetry ---
// Wraps ouraGet with retry logic for rate limiting and auth expiry.
// ERR-01: exponential backoff up to MAX_RETRIES, max 30s delay, user feedback on stderr.
// ERR-02: single retry after token refresh on 401; second 401 prompts re-auth.

export async function ouraGetWithRetry(path, params = {}, attempt = 0) {
  try {
    return await ouraGet(path, params);
  } catch (err) {
    // RATE_LIMITED (ERR-01): exponential backoff with user feedback
    if (err.message === 'RATE_LIMITED') {
      if (attempt < MAX_RETRIES) {
        const delay = Math.min((err.retryAfter ?? 2 ** attempt) * 1000, 30_000);
        process.stderr.write(
          `Rate limited -- retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...\n`
        );
        await new Promise((r) => setTimeout(r, delay));
        return ouraGetWithRetry(path, params, attempt + 1);
      }
      throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries. Try again in a few minutes.`);
    }

    // AUTH_EXPIRED (ERR-02): refresh and retry once
    if (err.message === 'AUTH_EXPIRED') {
      if (attempt === 0) {
        process.stderr.write('Access token expired -- refreshing...\n');
        await readTokens(); // readTokens() transparently refreshes when token is expired
        return ouraGetWithRetry(path, params, attempt + 1);
      }
      throw new Error('Authentication failed. Run /oura auth to re-authenticate.');
    }

    // NOT_AUTHENTICATED: no token file
    if (err.message === 'NOT_AUTHENTICATED') {
      throw new Error('Not authenticated. Run /oura auth to connect your Oura account.');
    }

    // REFRESH_FAILED: refresh token rejected
    if (err.message === 'REFRESH_FAILED') {
      throw new Error('Token refresh failed. Run /oura auth to re-authenticate.');
    }

    // MEMBERSHIP_REQUIRED (ERR-03)
    if (err.message === 'MEMBERSHIP_REQUIRED') {
      throw new Error(
        'This data requires an active Oura membership. Check your subscription at https://ouraring.com.'
      );
    }

    // APP_UPDATE_REQUIRED (ERR-03)
    if (err.message === 'APP_UPDATE_REQUIRED') {
      throw new Error('Please update your Oura app to the latest version to access this data.');
    }

    // DATA_NOT_SYNCED (ERR-03): empty data array from 200 response
    if (err.message === 'DATA_NOT_SYNCED') {
      throw new Error(
        'Data not yet synced. Check the Oura app and try again in a few minutes.'
      );
    }

    // All other errors: re-throw as-is
    throw err;
  }
}

// --- Exported: formatError ---
// Maps error code strings to user-friendly messages for callers that catch errors.

export function formatError(error) {
  switch (error.message) {
    case 'RATE_LIMITED':
      return 'Rate limited by Oura API. Try again in a few minutes.';
    case 'AUTH_EXPIRED':
      return 'Authentication expired. Run /oura auth to re-authenticate.';
    case 'NOT_AUTHENTICATED':
      return 'Not authenticated. Run /oura auth to connect your Oura account.';
    case 'REFRESH_FAILED':
      return 'Token refresh failed. Run /oura auth to re-authenticate.';
    case 'MEMBERSHIP_REQUIRED':
      return 'This data requires an active Oura membership.';
    case 'APP_UPDATE_REQUIRED':
      return 'Please update your Oura app to the latest version.';
    case 'AUTH_FORBIDDEN':
      return 'Access denied. Try running /oura auth to re-authenticate with all scopes.';
    case 'DATA_NOT_SYNCED':
      return 'Data not yet synced. Check the Oura app and try again in a few minutes.';
    default:
      return 'Oura API error: ' + error.message;
  }
}
