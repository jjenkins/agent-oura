# Pitfalls Research

**Domain:** Oura Ring API v2 integration / Claude Code skill (distributable)
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH (most Oura API findings from official docs; Claude Code skill credential findings from community sources)

---

## Critical Pitfalls

### Pitfall 1: Using Personal Access Tokens Instead of OAuth2

**What goes wrong:**
The skill is built using PAT-based auth (Authorization header with a long-lived token the user manually copies from the Oura developer portal). Initially works fine for a single user. When distribution begins, other users cannot use the skill without going through an undocumented manual PAT flow that Oura is actively removing. Oura has deprecated PATs; they are not guaranteed to exist for new accounts.

**Why it happens:**
PATs are much simpler to implement — just one header — and most existing example code (GitHub, wearipedia, blog posts) still uses them. Developers read old tutorials and assume PATs are the current model.

**How to avoid:**
Implement the full OAuth2 authorization code flow from day one. Use a redirect URI strategy compatible with CLI/local tooling (localhost redirect or out-of-band flow). Store the access token and refresh token securely per user. Never hardcode or commit any token.

**Warning signs:**
- Example code found online uses `Authorization: Bearer <long-static-token>` with no refresh logic
- No `refresh_token` handling in the auth layer
- Auth implementation does not have a token exchange step

**Phase to address:** Phase 1 (Auth foundation) — this is the first thing built; getting it wrong requires a full rewrite.

---

### Pitfall 2: Ignoring the Single-Use Refresh Token Constraint

**What goes wrong:**
OAuth2 refresh tokens from Oura are single-use. If the skill refreshes the token and then fails to persist the new refresh token (e.g., crashes, disk write fails, concurrent calls), the old refresh token is invalidated and the new one is lost. The user is forced to re-authenticate.

**Why it happens:**
Standard OAuth2 implementations treat refresh tokens as durable. Developers use libraries that assume refresh tokens can be retried. Oura's single-use constraint is in the documentation but easy to miss.

**How to avoid:**
Write the new refresh token atomically before making any API calls with the new access token. Use a write-then-rename pattern or file locking. Log all token refresh events. Add retry logic that detects `invalid_token` and re-prompts for auth rather than silently failing.

**Warning signs:**
- Token refresh code does not persist the new refresh token immediately
- Concurrent skill invocations are possible without token locking
- Error handling for `invalid_token` just retries without triggering re-auth

**Phase to address:** Phase 1 (Auth foundation) — build atomic token persistence from the start.

---

### Pitfall 3: Mismatched Date vs. Datetime Parameter Types

**What goes wrong:**
Most Oura API v2 endpoints use `start_date` / `end_date` in `YYYY-MM-DD` format. The heart rate endpoint uses `start_datetime` / `end_datetime` in full ISO 8601 (`YYYY-MM-DDThh:mm:ss`). Passing a date string to the heart rate endpoint returns a 422 or silently returns no data. Passing a datetime to date-only endpoints similarly fails.

**Why it happens:**
The parameter names look similar. Developers build a single `build_params(start, end)` helper and use it across all endpoints without realizing the heart rate endpoint is different. The Oura API documentation does not emphasize this distinction prominently.

**How to avoid:**
Create separate `build_date_params(start_date, end_date)` and `build_datetime_params(start_dt, end_dt)` helpers. Apply them explicitly per endpoint. Document which endpoints require which format in a constants file. Add validation that rejects wrong formats early.

**Warning signs:**
- A single generic `params` builder used across all endpoints
- Heart rate data consistently returning empty arrays
- No type distinction between `date` and `datetime` in the API client layer

**Phase to address:** Phase 2 (API client implementation) — enforce in the client layer before any endpoint is wired up.

---

### Pitfall 4: Storing OAuth Tokens in Plaintext / Committing Credentials

**What goes wrong:**
OAuth access tokens or refresh tokens are stored in a config file (e.g., `.claude/skills/oura/config.json`, `~/.oura_tokens`) that gets committed to version control, pasted into SKILL.md, or included in the distributed skill package. Any user who installs the skill gets the original developer's credentials.

**Why it happens:**
Claude Code skills are file-based and live in `.claude/skills/`. It is tempting to put all config including tokens in one place. Claude Code automatically loads `.env*` files without prompting, which can surface secrets unexpectedly.

**How to avoid:**
Tokens must be stored outside the skill directory — in OS keychain (macOS), `~/.config/oura-skill/tokens.json` with `0600` permissions, or environment variables. Never store tokens in `.claude/`, `SKILL.md`, or any file that could be committed. Add `.gitignore` entries for all token files. Document the storage path explicitly in the skill's setup instructions.

**Warning signs:**
- Token storage path is inside the skill or project directory
- No `.gitignore` entry for the token file
- SKILL.md references a token directly in the prompt

**Phase to address:** Phase 1 (Auth foundation) — determine secure storage path before writing any token-handling code.

---

### Pitfall 5: Not Requesting the Right OAuth Scopes Upfront

**What goes wrong:**
The skill initially requests minimal scopes (e.g., `daily`). Later phases add heart rate (`heartrate`), SpO2 (`spo2`), workouts (`workout`), etc. Existing authorized users must re-authenticate with the expanded scope set, breaking their session with no clear error. The API returns 401 with `invalid_scope` for the missing scope, which looks like an auth failure rather than a scope issue.

**Why it happens:**
Developers add features incrementally and request scopes only when needed. This is good practice for user privacy in web apps but breaks in CLI tools where re-auth is disruptive.

**How to avoid:**
Define the complete scope set upfront based on all planned endpoints: `personal daily heartrate workout tag session spo2`. Request all at initial authorization. Document each scope and the endpoint(s) it unlocks. Include a scope validation step on startup that compares granted scopes against required scopes and re-prompts if the gap exists.

**Warning signs:**
- OAuth authorization URL built without a comprehensive scope string
- 401 errors on specific endpoints but not others
- Scope list grows across phases without a re-auth mechanism

**Phase to address:** Phase 1 (Auth foundation) — finalize full scope list before first OAuth flow is implemented.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode today's date as default end_date | Simpler initial code | Date logic breaks at midnight boundary; users in non-UTC timezones get wrong defaults | Never — use user's local date from the start |
| Skip pagination handling | Works for 7-day queries | Fails silently for date ranges > ~30 days; users querying longer trends get partial data | Never — Oura returns `next_token` when results are paginated |
| Skip error message extraction from RFC7807 response body | Simpler error handling | 401/403/429 errors show as generic HTTP errors; impossible to distinguish scope issues from expired tokens | Never — the `detail` field is required for useful error messages |
| Single access token, no refresh logic | Works for 30 days | Token expires silently; users get mysterious auth failures | MVP only if marked as known limitation with re-auth instructions |
| Fetch all data on every skill invocation | No caching complexity | Rate limit (5000 req/5 min) hit quickly with multiple endpoint calls; slow responses | Never if fetching more than 3-4 endpoints per invocation |

---

## Integration Gotchas

Common mistakes when connecting to the Oura API v2.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Heart rate endpoint | Use `start_date`/`end_date` instead of `start_datetime`/`end_datetime` | Use full ISO 8601 datetimes; default time to `T00:00:00` for start and `T23:59:59` for end |
| OAuth token in request | Pass token as query parameter (old v1 pattern) | Pass exclusively as `Authorization: Bearer <token>` header; v2 rejects query-param tokens |
| Scope string | Use scope names from v1 docs (e.g., `spo2Daily`) | Use v2 scope names (`spo2`); wrong names cause 401 even if the user has granted the scope |
| Token refresh | Treat refresh token as reusable | Refresh tokens are single-use; persist new refresh token immediately or user loses access |
| App version check | Ignore 426 errors | 426 means user's Oura mobile app is outdated; surface a clear message instructing the user to update the app |
| Data freshness | Expect today's sleep data to be available today | Sleep and readiness data is available the following day after the ring syncs; do not error on missing same-day data |
| Membership gate | Assume all Oura users can access the API | Gen3 and Ring 4 users without active Oura Membership cannot access the API; handle 403 with a clear membership explanation |
| Pagination | Assume one response contains all data | Oura responses include `next_token` when results are paginated; always follow `next_token` until absent |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching all endpoints on every `/oura` invocation | Slow responses; rate limit warnings for power users | Only fetch endpoints relevant to the requested view; batch calls when user asks for a dashboard | Beyond ~8 endpoint calls per invocation; ~5000 req/5 min limit |
| No response caching | Re-fetching identical date ranges on repeated queries | Cache responses in a session-scoped temp file keyed by endpoint + date range; invalidate after 5 min | Immediately visible on multi-step NL conversations that re-query same data |
| Requesting 90-day ranges by default | Each paginated response multiplies API calls | Default to 7 days; let user explicitly request longer ranges with a clear warning | When user queries >30 days across multiple endpoints simultaneously |
| Parsing full ISO 8601 timestamps in-process for heart rate data | Heart rate returns minute-level data; large date ranges produce thousands of rows | Apply server-side date range filtering tightly; do not pull more data than needed | >7-day heart rate queries; produces very large payloads |

---

## Security Mistakes

Domain-specific security issues for a distributable Claude Code skill using OAuth2.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding OAuth client secret in distributed skill files | Any installer extracts secret and can impersonate your OAuth app | Store client secret out-of-band (env var, system keychain); never include in SKILL.md or committed config |
| Using a shared OAuth app client ID/secret across all users | Revocation of any one user's token revokes the app; rate limits shared | Each user must register their own Oura OAuth app in the developer portal, or use a hosted relay with per-user token isolation |
| Token file with world-readable permissions | Other users on same machine can read OAuth tokens | Write token files with `0600` permissions; verify on each startup |
| Not validating OAuth state parameter | CSRF attack can hijack OAuth callback and inject attacker's token | Generate a cryptographically random state value per auth session; verify before exchanging code for token |
| Logging full API responses | Health data (sleep, heart rate, readiness) appears in Claude Code logs/transcripts | Redact or omit sensitive health values from debug logging; log only status codes and endpoint names |

---

## UX Pitfalls

Common user experience mistakes specific to health data skills.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Returning raw JSON or numeric scores without context | "Your readiness score is 74" — user does not know if this is good or bad | Always include Oura's scale context (scores are 0-100; 85+ is optimal) and a plain-language interpretation |
| Treating missing today's data as an error | Users who run the skill in the morning before sync get confusing errors | Detect missing same-day data and display yesterday's data with a note explaining sync timing |
| No guidance when Oura app is not synced | API returns empty arrays; skill says "No data available" with no explanation | Check if the most recent data point is more than 48 hours old; proactively suggest syncing the Oura app |
| 426 error shown as generic failure | User sees "API error 426" with no resolution path | Detect 426 explicitly and display: "Your Oura app needs an update. Please update the Oura mobile app to use this skill." |
| Requiring full re-auth with no explanation | User sees "Authorization failed" mid-session with no guidance | Detect expired/invalid tokens and display a clear re-auth prompt with the exact command to run |
| Showing heart rate as minute-level rows | Raw heart rate data is overwhelming and useless at that granularity | Aggregate heart rate to hourly averages or daily min/max/avg before presenting |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **OAuth flow:** The authorization URL works, but token refresh is not implemented — verify that a 401 on an API call triggers a token refresh and retries automatically.
- [ ] **Heart rate endpoint:** Returns data for 1-day ranges, but has not been tested with datetime boundary conditions (midnight in user's local timezone vs. UTC).
- [ ] **Pagination:** Single-page responses work, but has not been tested with date ranges that trigger `next_token` — verify with a 30+ day heart rate or activity query.
- [ ] **Scope coverage:** Auth flow works, but the scope string may be missing `spo2` or `session` — verify each planned endpoint against the granted scope list.
- [ ] **Membership gate:** API calls succeed for developer's account, but has not been tested with a Gen3/Ring 4 account without membership — verify 403 handling and error message.
- [ ] **Data freshness:** Dashboard shows data for yesterday correctly, but today's behavior (empty array vs. partial data vs. error) has not been validated.
- [ ] **Token storage security:** Tokens are saved, but file permissions have not been verified — run `ls -la` on the token file to confirm `0600`.
- [ ] **Distributable install:** Skill works in developer's environment, but has not been tested as a fresh install on a machine with no pre-existing config.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Deployed with PAT auth, need to migrate to OAuth2 | HIGH | Rewrite auth layer; require all users to re-authenticate; update SKILL.md install instructions |
| Lost refresh token (not persisted atomically) | LOW | User runs `/oura auth` again; single re-auth event; no data loss |
| Wrong scope set deployed | MEDIUM | Update OAuth app scopes in Oura developer portal; require all users to re-authenticate to grant new scopes |
| Token committed to git | HIGH | Rotate credentials immediately in Oura developer portal; purge git history; audit for any data exposure |
| Date/datetime mismatch causing silent empty responses | LOW | Fix param builder and deploy; no user re-auth needed; users just get correct data on next call |
| Rate limit hit during a large query | LOW | Add exponential backoff with retry; reduce default date range; deploy fix |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PAT instead of OAuth2 | Phase 1 (Auth) | Auth flow issues an OAuth authorization URL, exchanges code for token, stores refresh token |
| Single-use refresh token not persisted atomically | Phase 1 (Auth) | Simulate token expiry; verify new refresh token is written before old one is used |
| Mismatched date vs. datetime params | Phase 2 (API client) | Unit test each endpoint's param builder; heart rate endpoint receives datetime, others receive date |
| Tokens in plaintext or committed | Phase 1 (Auth) | Token file path is outside skill directory; file has 0600 perms; .gitignore entry exists |
| Incomplete scope list | Phase 1 (Auth) | All planned endpoint scopes included in initial auth URL; scope validation on startup |
| No pagination support | Phase 2 (API client) | Integration test with 30+ day range; verify `next_token` is followed |
| 426 / membership 403 unhandled | Phase 2 (API client) | Manual test with known error conditions; specific error messages verified |
| Missing same-day data treated as error | Phase 3 (Dashboard) | Test skill invocation before noon with today's date; verify graceful fallback to yesterday |
| Raw data without health context | Phase 3 (Dashboard) | All score outputs include scale reference and plain-language interpretation |
| No caching, repeated fetches | Phase 3 or 4 | Multi-step NL conversation test; verify same endpoint+date range not re-fetched in same session |

---

## Sources

- Oura API v2 Official Documentation: https://cloud.ouraring.com/v2/docs
- Oura API Authentication Docs: https://cloud.ouraring.com/docs/authentication
- Oura API Error Handling Docs: https://cloud.ouraring.com/docs/error-handling
- Oura API V2 Upgrade Guide: https://partnersupport.ouraring.com/hc/en-us/articles/19907726838163-Oura-API-V2-Upgrade-Guide
- hedgertronic/oura-ring Python client (date vs datetime param handling): https://github.com/hedgertronic/oura-ring/blob/main/oura_ring.py
- Airbyte Oura Connector known limitations: https://docs.airbyte.com/integrations/sources/oura
- Home Assistant Oura v2 integration community discussion (real-world bugs): https://community.home-assistant.io/t/oura-ring-v2-custom-integration-track-your-sleep-readiness-activity-in-home-assistant/944424
- MindStudio Claude Code Skills Common Mistakes: https://www.mindstudio.ai/blog/claude-code-skills-common-mistakes-guide
- Claude Code Security Best Practices: https://www.backslash.security/blog/claude-code-security-best-practices
- Claude Code Automatically Loads .env Secrets (security): https://www.knostic.ai/blog/claude-loads-secrets-without-permission
- Oura API rate limit confirmed at 5000 req/5 min window: https://cloud.ouraring.com/docs/error-handling

---
*Pitfalls research for: Oura Ring API v2 + Claude Code distributable skill*
*Researched: 2026-03-21*
