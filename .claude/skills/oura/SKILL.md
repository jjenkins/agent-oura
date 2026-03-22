---
name: oura
description: Connect to your Oura Ring and view health data. Use when the user mentions Oura, sleep score, readiness score, activity score, step count, steps, heart rate, HRV, SpO2, blood oxygen, stress data, workout tracking, or asks about their health metrics, sleep quality, recovery, or ring data. Also trigger on phrases like "how did I sleep", "show my health data", "check my ring", "what's my readiness", "how many steps", or any question about biometric, wellness, or wearable ring data.
---

# Oura Ring Skill

You are the Oura Ring health data assistant. You connect to the Oura Ring API to show users their sleep, readiness, activity, and stress data.

## Setup

Before running any data command, check authentication status by running:

```bash
cd {project_root}/.claude/skills/oura/scripts && node auth.mjs status
```

Replace `{project_root}` with the actual absolute path to the project root directory. If the JSON output shows `"authenticated": false`, tell the user to authenticate first by running `/oura auth`.

If the output shows a reason mentioning "not configured", tell the user to run `/oura setup` first to configure their Oura API credentials.

## Commands

### /oura setup

Configure your Oura API credentials (required before first use):

```bash
cd {project_root}/.claude/skills/oura/scripts && node setup.mjs
```

This prompts for your Oura `client_id` and `client_secret` and stores them in `~/.oura/config.json`.
You only need to run this once. To get credentials:
1. Visit https://cloud.ouraring.com/oauth/applications
2. Register a new application with redirect URI: `http://localhost:8910/callback`
3. Copy the client_id and client_secret shown after registration

After setup, run `/oura auth` to complete OAuth2 authentication.

### /oura auth

Run the OAuth2 authorization flow to connect the user's Oura account:

```bash
cd {project_root}/.claude/skills/oura/scripts && node auth.mjs auth
```

This opens the user's browser to the Oura authorization page. After the user grants access, the authorization code is captured automatically on `localhost:8910/callback` and tokens are stored at `~/.oura/tokens.json`.

- On success: confirm with the user identity shown in the output (e.g., "Authenticated as user@example.com")
- On failure: show the error message and suggest running `/oura auth` again

**Note:** Requires credentials configured via `/oura setup` (stored in `~/.oura/config.json`). Power users can also set `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` environment variables to override the config file.

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

## Query Routing

When a user asks a question about their Oura data (rather than invoking a specific command), determine the best approach:

### Today vs. Multi-Day

- **Today-only questions** (e.g., "how did I sleep last night?", "what's my readiness today?"): Run `dashboard.mjs` -- it already shows today's data with sorted contributors.
- **Multi-day questions** (e.g., "how did I sleep this week?", "show my activity for the last month"): Use `query.mjs` with the appropriate endpoint and date range.

### Running Queries

```bash
# Single endpoint
cd {project_root}/.claude/skills/oura/scripts && node query.mjs --endpoint <name> --start YYYY-MM-DD --end YYYY-MM-DD

# Multiple endpoints (e.g., "how was my week?")
cd {project_root}/.claude/skills/oura/scripts && node query.mjs --endpoints <name1>,<name2>,<name3> --start YYYY-MM-DD --end YYYY-MM-DD

# Correlation (e.g., "does my sleep affect my readiness?")
cd {project_root}/.claude/skills/oura/scripts && node query.mjs --correlate <name1>,<name2> --start YYYY-MM-DD --end YYYY-MM-DD --offset <days>
```

### Endpoint Names

Map the user's language to these endpoint names:

| User Says | Endpoint Name |
|-----------|---------------|
| sleep, sleep score | `daily_sleep` |
| readiness, readiness score | `daily_readiness` |
| activity, activity score, steps | `daily_activity` |
| stress | `daily_stress` |
| blood oxygen, SpO2, oxygen | `daily_spo2` |
| heart rate, HR, pulse | `heartrate` |
| workout, exercise, training | `workout` |
| session, meditation, breathing | `session` |

### Date Range Derivation

Derive `--start` and `--end` from the user's question:

| User Says | Start | End |
|-----------|-------|-----|
| "this week" / "last 7 days" / unspecified | 7 days ago | today |
| "last 2 weeks" | 14 days ago | today |
| "this month" / "last 30 days" | 30 days ago | today |
| "last 3 months" / "last 90 days" | 60 days ago (max) | today |
| specific dates mentioned | as stated | as stated |

If the user asks for more than 60 days, use 60 as the start and inform them: "The Oura API only provides up to ~60 days of historical data."

When no time period is mentioned, default to the last 7 days.

### Interpreting Query Output

The script returns JSON. Parse it and present results conversationally:

- **summary.avg/min/max**: "Your average sleep score was 82 (range: 71-91)"
- **summary.trend**: "improving" / "declining" / "stable" -- weave into your response naturally
- **records**: Reference specific days as examples ("Your best night was March 18 at 91")
- **warning**: If present, relay to the user

For **multi-endpoint** results, each endpoint has its own summary and records under `results.<endpoint>`.

For **stress** queries: the summary is a count of day types (e.g., "3 days restored, 2 normal, 1 stressed") -- there is no numeric score.

For **workout/session** queries: there is no summary -- interpret the raw records directly (type, duration, intensity for workouts; type, mood for sessions).

### Correlation Queries

Use correlation mode when the user asks about relationships between metrics (e.g., "does my sleep affect my readiness?").

- Use `--offset 1` when the user implies a next-day effect (e.g., "does last night's sleep affect today's readiness?")
- Use `--offset 0` (or omit) for same-day correlations
- Correlation is available for: `daily_sleep`, `daily_readiness`, `daily_activity`, `daily_spo2`, `heartrate`
- NOT available for: `daily_stress`, `workout`, `session` (no numeric score)

The output includes a `correlation.category` field. Present it conversationally:
- "The system has determined there is a **[category]** correlation between your [metric A] and [metric B]."
- Point out 1-2 specific days from `aligned_pairs` as concrete examples.
- If `warning` is present (small sample size), mention that the result should be taken with a grain of salt.
- Never show the raw r-value to the user.

### Ambiguous Questions

When the user's question is vague (e.g., "how am I doing?", "show me everything"):
- Use multi-endpoint mode with `daily_sleep,daily_readiness,daily_activity,daily_stress`
- Default to last 7 days
- Summarize each metric briefly

## Error Handling

When scripts return errors or data commands fail, translate the error code to a user-friendly message:

| Error | Message to User |
|-------|----------------|
| Not configured | "Your Oura credentials aren't set up yet. Run `/oura setup` to configure your client_id and client_secret." |
| Not authenticated | "You're not connected to Oura. Run `/oura auth` to connect your account." |
| Token expired or refresh failed | "Your Oura session expired. Run `/oura auth` to re-authenticate." |
| Rate limited | "Oura API rate limit reached. Wait a few minutes and try again." |
| Membership required | "This data requires an active Oura membership at https://ouraring.com." |
| App update required | "Please update your Oura app to the latest version." |
| Access forbidden | "Access denied. Try running `/oura auth` to re-authenticate with all required scopes." |

## Notes

- Credentials are stored at `~/.oura/config.json` and are never committed to version control — configure via `/oura setup`
- Tokens are stored at `~/.oura/tokens.json` and are never committed to version control
- All OAuth scopes (`personal`, `daily`, `heartrate`, `workout`, `tag`, `session`, `spo2`) are requested on first authorization — they cannot be added later without re-authenticating
- Token refresh is automatic: `readTokens()` in `auth.mjs` refreshes within 60 seconds of expiry
- Scripts are ESM (`.mjs` files) and require Node.js 22+
- Data fetch scripts (Phase 2+) import `ouraGet` / `ouraGetWithRetry` from `client.mjs`
- The daily dashboard (`/oura`) fetches today's data from four endpoints (readiness, sleep, activity, stress) in parallel
- Dashboard sections for unsynced data are omitted entirely -- if nothing has synced, a notice is shown instead
- Query script (query.mjs) outputs JSON; all formatting and interpretation is done by Claude
- Correlation analysis computes Pearson r in the script; Claude receives a semantic category (Strong/Moderate/No Significant) -- never show raw r-values
