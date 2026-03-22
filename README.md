# Agent Oura

A Claude Code skill that connects to your Oura Ring, giving you a health dashboard and natural-language data analysis for sleep, readiness, activity, stress, and biometric data — all without leaving your terminal.

## What It Does

- Daily health dashboard with readiness, sleep, activity, and stress scores
- Natural-language queries ("how did I sleep this week?", "show my readiness trend")
- Correlation analysis across metrics (e.g., "does my sleep affect my readiness?")
- Workout, session, SpO2, and heart rate data access
- Personal profile and ring configuration

## Prerequisites

- Node.js 22+ (check with `node --version`)
- An Oura Ring with an active account
- An Oura developer application (instructions below)

## Installation

```bash
npx skills add jjenkins/agent-oura
```

Then install the script dependencies:

```bash
cd .claude/skills/oura/scripts && npm install
```

### Alternative install methods

<details>
<summary>Install via shell script (includes vendored dependencies)</summary>

```bash
curl -sL https://raw.githubusercontent.com/jjenkins/agent-oura/main/install.sh | bash
```

Or download and review first:

```bash
curl -sL https://raw.githubusercontent.com/jjenkins/agent-oura/main/install.sh -o install.sh
less install.sh
bash install.sh
```

This copies vendored `node_modules` so no `npm install` is needed.
</details>

<details>
<summary>Install from .skill file</summary>

```bash
claude install-skill https://raw.githubusercontent.com/jjenkins/agent-oura/main/oura.skill
cd .claude/skills/oura/scripts && npm install
```
</details>

## Setting Up Your Oura Developer App

Before using the skill, you need to register a developer application with Oura:

1. Go to https://cloud.ouraring.com/oauth/applications
2. Log in with your Oura account
3. Click **"New Application"** (or "Create Application")
4. Fill in the form:
   - **App Name:** anything you like (e.g., "Claude Code Oura Skill")
   - **Description:** optional
   - **Website URL:** `http://localhost:8910` (required by the form — for personal use, localhost is fine)
   - **Privacy Policy URL:** `http://localhost:8910` (same — just for personal use)
   - **Terms of Service URL:** `http://localhost:8910` (same — just for personal use)
   - **Redirect URIs:** `http://localhost:8910/callback`
     > This must be exactly `http://localhost:8910/callback` — no trailing slash, no https, port 8910
   - **Default Scopes:** select all available scopes (personal, daily, heartrate, workout, tag, session, spo2)
5. Click **"Save"** (or "Create")
6. Copy the **Client ID** and **Client Secret** shown on the next page — you'll need these in the next step

> **Important:** Keep your Client Secret private. Never commit it to version control.

## Configuration

In Claude Code, run:

```
/oura setup
```

Paste your **Client ID** and **Client Secret** when prompted. These are stored in `~/.oura/config.json` (file permissions: 0600).

Then authenticate:

```
/oura auth
```

This opens your browser to authorize the skill with your Oura account. After granting access, return to Claude Code — authentication is complete.

## Usage

### Daily Dashboard

```
/oura
```

Shows today's readiness, sleep, activity, and stress scores with top contributors.

### Profile & Ring Info

```
/oura profile
```

Shows your personal info and ring configuration.

### Authentication Status

```
/oura status
```

Check if your Oura connection is active and when your token expires.

### Natural Language Queries

Ask questions about your data in plain English:

- "How did I sleep this week?"
- "Show my readiness trend for the last 30 days"
- "What were my workouts this month?"
- "Does my sleep score affect my readiness the next day?"
- "Show my heart rate data for the last 3 days"
- "How has my activity been lately?"

Claude routes your question to the right Oura API endpoints and presents the results conversationally.

### Re-authenticate

```
/oura auth
```

Run again if your session expires or you need to reconnect.

## Troubleshooting

### "Node.js 22+ required"

The skill requires Node.js 22 or later. Check your version:

```bash
node --version
```

Install the latest LTS from https://nodejs.org.

### "redirect_uri_mismatch" during authentication

The redirect URI in your Oura developer app must be exactly:

```
http://localhost:8910/callback
```

Common mistakes:
- Using `https` instead of `http`
- Adding a trailing slash (`/callback/`)
- Using a different port number

Go to https://cloud.ouraring.com/oauth/applications, edit your app, and fix the redirect URI.

### "Credentials not configured"

Run `/oura setup` and paste your Oura Client ID and Client Secret.

### "Token expired" or "refresh failed"

Run `/oura auth` to re-authenticate. This can happen if your refresh token was invalidated (e.g., by revoking access in the Oura app).

### "Rate limit reached"

The Oura API limits requests to ~5000 per 5-minute window. Wait a few minutes and try again. This is rare in normal usage.

### "Membership required"

Some Oura data (like detailed sleep stages) requires an active Oura membership. Visit https://ouraring.com to check your subscription status.

### "Port 8910 is in use"

Another process is using port 8910. Find and stop it:

```bash
lsof -i :8910
```

Then run `/oura auth` again.

## Environment Variables (Optional)

Power users can set environment variables instead of using `/oura setup`:

| Variable | Purpose |
|----------|---------|
| `OURA_CLIENT_ID` | Override the client_id from config.json |
| `OURA_CLIENT_SECRET` | Override the client_secret from config.json |

Environment variables take precedence over `~/.oura/config.json`.

## How It Works

Agent Oura is a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) — a set of instructions and scripts that extend Claude's capabilities. When you ask about your Oura data, Claude:

1. Runs the appropriate script (dashboard, query, profile) via the terminal
2. The script authenticates with Oura's API using your stored credentials
3. Data is returned as structured output
4. Claude interprets the data and responds conversationally

All data stays local — nothing is sent to third parties beyond the Oura API itself.

## License

MIT
