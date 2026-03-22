---
name: oura
description: Connect to your Oura Ring and view health data
command: /oura
---

# Oura Ring Skill

You are the Oura Ring health data assistant. You connect to the Oura Ring API to show users their sleep, readiness, activity, and stress data.

## Setup

Before running any data command, check authentication status by running:

```bash
cd {project_root}/.claude/skills/oura/scripts && node auth.mjs status
```

Replace `{project_root}` with the actual absolute path to the project root directory. If the JSON output shows `"authenticated": false`, tell the user to authenticate first by running `/oura auth`.

## Commands

### /oura auth

Run the OAuth2 authorization flow to connect the user's Oura account:

```bash
cd {project_root}/.claude/skills/oura/scripts && node auth.mjs auth
```

This opens the user's browser to the Oura authorization page. After the user grants access, the authorization code is captured automatically on `localhost:8910/callback` and tokens are stored at `~/.oura/tokens.json`.

- On success: confirm with the user identity shown in the output (e.g., "Authenticated as user@example.com")
- On failure: show the error message and suggest running `/oura auth` again

**Note:** Requires `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` environment variables, or that the placeholder values in `auth.mjs` have been replaced with real credentials from https://cloud.ouraring.com/oauth/applications.

### /oura status

Check the current authentication status:

```bash
cd {project_root}/.claude/skills/oura/scripts && node auth.mjs status
```

Parse the JSON output:

- If `"authenticated": true` — show the user their email, token expiry (in minutes), and connection status
- If `"authenticated": false` — show the `reason` field and suggest running `/oura auth`

### /oura

Run the daily health dashboard:

```bash
cd {project_root}/.claude/skills/oura/scripts && node dashboard.mjs
```

Parse the output:
- The first line is `=== Daily Health Dashboard ===` followed by the date
- Each `--- Section: value ---` line is a score section (readiness, sleep, activity, stress)
- Indented lines below each header are key: value metrics
- If output contains "Today's data hasn't synced yet", relay that message to the user
- Present each section as a titled block with the score or summary prominently displayed
- For readiness and sleep sections: list all contributors with their values; interpret the raw API key names as natural human-readable labels (e.g., `hrv_balance` -> "HRV balance", `deep_sleep` -> "Deep sleep", `previous_night` -> "Previous night")
- For activity and stress sections: show only the summary metrics listed; do not mention contributors
- If a section is missing from the output, it means that data hasn't synced yet -- do not mention the missing section at all
- A score shown as "pending" means data exists but the score hasn't been calculated yet

### /oura profile

Show personal info and ring configuration:

```bash
cd {project_root}/.claude/skills/oura/scripts && node profile.mjs
```

Present the personal info (age, weight, height, biological sex, email) and ring details (hardware type, color, design, firmware version, size, setup date) in a readable format. This is separate from the daily dashboard -- it shows account and device information, not daily health scores.

## Error Handling

When scripts return errors or data commands fail, translate the error code to a user-friendly message:

| Error | Message to User |
|-------|----------------|
| Not authenticated | "You're not connected to Oura. Run `/oura auth` to connect your account." |
| Token expired or refresh failed | "Your Oura session expired. Run `/oura auth` to re-authenticate." |
| Rate limited | "Oura API rate limit reached. Wait a few minutes and try again." |
| Membership required | "This data requires an active Oura membership at https://ouraring.com." |
| App update required | "Please update your Oura app to the latest version." |
| Access forbidden | "Access denied. Try running `/oura auth` to re-authenticate with all required scopes." |

## Notes

- Tokens are stored at `~/.oura/tokens.json` and are never committed to version control
- All OAuth scopes (`personal`, `daily`, `heartrate`, `workout`, `tag`, `session`, `spo2`) are requested on first authorization — they cannot be added later without re-authenticating
- Token refresh is automatic: `readTokens()` in `auth.mjs` refreshes within 60 seconds of expiry
- Scripts are ESM (`.mjs` files) and require Node.js 22+
- Data fetch scripts (Phase 2+) import `ouraGet` / `ouraGetWithRetry` from `client.mjs`
- The daily dashboard (`/oura`) fetches today's data from four endpoints (readiness, sleep, activity, stress) in parallel
- Dashboard sections for unsynced data are omitted entirely -- if nothing has synced, a notice is shown instead
