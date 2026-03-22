# Phase 1: Auth and API Client - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 01-auth-and-api-client
**Areas discussed:** OAuth callback UX, Token storage, Credential setup

---

## OAuth Callback UX

| Option | Description | Selected |
|--------|-------------|----------|
| Local HTTP server | Spin up temporary localhost server, catch callback automatically | ✓ |
| Manual paste | User copies redirect URL back into terminal | |
| You decide | Claude picks | |

**User's choice:** Local HTTP server
**Notes:** Smoothest UX, requires open port

---

### Callback Server Language

| Option | Description | Selected |
|--------|-------------|----------|
| Node.js | Keep everything in one language, http module built-in | |
| Python | Zero-dependency, universally available | |
| You decide | Claude picks | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on implementation language

---

### Post-Auth Display

| Option | Description | Selected |
|--------|-------------|----------|
| Browser + terminal | Browser shows success, terminal shows confirmation with token info | ✓ |
| Terminal only | Browser minimal, terminal shows real confirmation | |

**User's choice:** Browser + terminal

---

### Callback Port

| Option | Description | Selected |
|--------|-------------|----------|
| Random available port | Dynamic port, needs multiple redirect URIs | |
| Fixed port (e.g. 8910) | Predictable, one redirect URI needed | ✓ |

**User's choice:** Fixed port

---

### Browser Opening

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-open + fallback | Try auto-open, print URL if fails | ✓ |
| Print URL only | Always manual | |

**User's choice:** Auto-open + fallback

---

### OAuth Scopes

| Option | Description | Selected |
|--------|-------------|----------|
| All scopes | personal daily heartrate workout tag session spo2 | ✓ |
| Minimal + prompt | Start core, ask user for extras | |

**User's choice:** All scopes
**Notes:** Can't add scopes later without re-auth

---

### Timeout Duration

| Option | Description | Selected |
|--------|-------------|----------|
| 2 minutes | Generous for slow browsers/MFA | ✓ |
| 5 minutes | Extra generous | |

**User's choice:** 2 minutes

---

### Token Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, validate | Call /personal_info, show user name | ✓ |
| No, trust the flow | Assume tokens good | |

**User's choice:** Validate with test API call

---

### Timeout Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Timeout + clear message | Show retry instructions after timeout | ✓ |
| Ctrl+C to cancel | User presses Ctrl+C | |
| Both | Ctrl+C + timeout fallback | |

**User's choice:** Timeout + clear message

---

### Re-authentication

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run auth command | Same command, overwrites tokens | ✓ |
| Explicit revoke first | Logout before re-auth | |

**User's choice:** Re-run auth command

---

### Multiple Accounts

| Option | Description | Selected |
|--------|-------------|----------|
| Single account only | One token set, re-auth overwrites | ✓ |
| Named profiles | --profile=name for multiple accounts | |

**User's choice:** Single account only

---

### Scope Display

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, list scopes | Show granted scopes after auth | |
| No, just confirm | Show "Authenticated as [name]" | ✓ |

**User's choice:** No, just confirm

---

### App Distribution Model

| Option | Description | Selected |
|--------|-------------|----------|
| Each user registers | Users create own app at Oura console | |
| Shared app | One app registration, distribute client_id | ✓ |

**User's choice:** Shared app
**Notes:** Simplifies setup significantly for end users

---

### Client Secret Handling

| Option | Description | Selected |
|--------|-------------|----------|
| PKCE (no secret) | Modern flow, needs Oura support | |
| Embedded secret | Ship in skill code, common for OSS CLI tools | ✓ |

**User's choice:** Embedded secret

---

## Token Storage

### Storage Location

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.config/oura-skill/ | XDG-style config dir | |
| ~/.oura/ | Simple dotfile path | ✓ |

**User's choice:** ~/.oura/

---

### File Protection

| Option | Description | Selected |
|--------|-------------|----------|
| File permissions (0600) | Standard Unix, owner-only | ✓ |
| Encrypted at rest | Encrypt with machine identity key | |

**User's choice:** File permissions (0600)

---

### File Format

| Option | Description | Selected |
|--------|-------------|----------|
| JSON | Plain JSON, easy to debug | ✓ |

**User's choice:** JSON

---

### Status Command

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show status | Authenticated as, expiry, scopes | ✓ |
| No, unnecessary | Errors surface naturally | |

**User's choice:** Yes, show status

---

## Credential Setup

### First-Run Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Just auth | Install, /oura auth, done | ✓ |
| Welcome + auth | Brief welcome message then auth | |

**User's choice:** Just auth — zero config

---

### Credential Override

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, via env vars | OURA_CLIENT_ID/SECRET override defaults | |
| No, just shared | Everyone uses shared app | |
| You decide | Claude picks | ✓ |

**User's choice:** You decide

---

## Claude's Discretion

- Callback server language (Node.js or Python)
- Env var overrides for credentials (power user option)
- Error message verbosity and formatting
- Retry strategy details for rate limiting
- Welcome message on first run

## Deferred Ideas

None — discussion stayed within phase scope
