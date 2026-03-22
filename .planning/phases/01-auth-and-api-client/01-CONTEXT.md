# Phase 1: Auth and API Client - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure OAuth2 authentication flow for the Oura Ring API v2, persistent token storage with atomic refresh handling, and an authenticated HTTP client with error handling (rate limits, auth errors, missing data). Users can authenticate, stay authenticated across sessions, and the client handles all common error scenarios gracefully.

</domain>

<decisions>
## Implementation Decisions

### OAuth Callback Flow
- **D-01:** Use a local HTTP server on a fixed port (e.g., 8910) to catch the OAuth callback — smoothest UX, predictable redirect URI
- **D-02:** Auto-open the browser with the auth URL; if browser open fails, print the URL for manual copy
- **D-03:** Request all scopes upfront at first auth: `personal daily heartrate workout tag session spo2` — cannot add scopes later without re-auth
- **D-04:** 2-minute timeout on the callback server; if timed out, show clear message to retry
- **D-05:** After receiving tokens, validate by calling `/v2/usercollection/personal_info` — show "Authenticated as [name]" on success
- **D-06:** Browser shows "Success, return to terminal" page; terminal shows the real confirmation with user name
- **D-07:** Single account only — one set of tokens, re-running auth overwrites existing tokens
- **D-08:** On timeout, show "Auth timed out. Run /oura auth to try again." — no Ctrl+C handling needed
- **D-09:** Do not show granted scopes after auth — just confirm identity

### Credential Distribution
- **D-10:** Shared Oura developer app — client_id and client_secret are embedded in the skill code
- **D-11:** Embedded client_secret is acceptable (common pattern for open-source CLI tools like Spotify CLI)
- **D-12:** Zero config for end users — install skill, run `/oura auth`, done

### Token Storage
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Oura API
- `.planning/research/STACK.md` — Technology recommendations, OAuth2 dual-subdomain detail (cloud.ouraring.com for auth, api.ouraring.com for data)
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, token lifecycle details
- `.planning/research/PITFALLS.md` — Single-use refresh tokens, scope selection, date format differences, operational constraints

### Project
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-04, ERR-01 through ERR-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None — patterns will be established by this phase

### Integration Points
- Token file at `~/.oura/tokens.json` will be read by all subsequent phases
- API client module established here will be imported by dashboard (Phase 2) and query routing (Phase 3)
- Error handling patterns set here (retry, auth refresh, user messaging) become the standard for all API interactions

</code_context>

<specifics>
## Specific Ideas

- Auth flow should feel like "install and go" — zero friction for end users
- The shared app model means users never touch developer portals or manage credentials
- Token validation via personal_info call serves double duty: confirms tokens work AND gives user's name for the confirmation message

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-auth-and-api-client*
*Context gathered: 2026-03-21*
