# Phase 2: Daily Dashboard - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Unified health dashboard showing readiness, sleep, activity, and stress scores for today. Includes top contributors for readiness and sleep. Handles missing/unsynced data gracefully. Separate command for personal info and ring configuration. Does NOT include natural language queries, trend analysis, or extended data types (workouts, sessions, SpO2, heart rate).

</domain>

<decisions>
## Implementation Decisions

### Dashboard structure
- **D-01:** Sectioned layout — each score (readiness, sleep, activity, stress) gets its own section
- **D-02:** Equal structural treatment across all four sections (same heading style, same layout)
- **D-03:** Each section shows score + 2-3 key supporting metrics — keep sections tight
- **D-04:** Stress section may be shorter than others if the API returns fewer fields — be honest about the data, no padding

### Contributors display
- **D-05:** Show ALL contributors for readiness and sleep (not just top N)
- **D-06:** Sort contributors by impact, worst-to-best — problem areas surface first
- **D-07:** Claude interprets contributor names naturally in conversation (not hardcoded human-readable labels)
- **D-08:** Activity and stress sections silently omit contributors — no "not available" notice

### Missing data / sync handling
- **D-09:** Show today's data for whatever scores have synced; collapse sections that haven't synced yet
- **D-10:** Collapsed sections are omitted entirely, not shown as empty placeholders
- **D-11:** If NOTHING has synced today, show a short notice ("Today's data hasn't synced yet") — no fallback to yesterday's data

### Personal info command
- **D-12:** Separate `/oura profile` command for personal info + ring configuration — not part of the daily dashboard
- **D-13:** Show everything the API returns (age, weight, height, biological sex, email, ring color, design, firmware, hardware type, setup date)
- **D-14:** Include available connectivity info alongside profile data (ring hardware type, firmware version, setup date)
- **D-15:** `/oura status` (Phase 1 auth check) stays separate from `/oura profile`

### Claude's Discretion
- Exact key metrics chosen for each section's 2-3 supporting values
- Section ordering (readiness first vs sleep first, etc.)
- Formatting of score values (plain numbers, color descriptors, etc.)
- How Claude phrases the "not synced" notice
- Layout of `/oura profile` output

</decisions>

<specifics>
## Specific Ideas

- Dashboard should feel like a morning health briefing — glance and know where you stand
- Contributors sorted worst-first gives actionable insight: what's dragging you down today?
- No stale data — if it hasn't synced, say so. Don't show yesterday's numbers as if they're today's.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Oura API
- `.planning/research/STACK.md` — Technology recommendations, script patterns (ESM .mjs, stdout for Claude)
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, how scripts output for Claude to interpret
- `.planning/research/PITFALLS.md` — Date format differences, sync delay behavior, API response shapes

### Prior phase
- `.planning/phases/01-auth-and-api-client/01-CONTEXT.md` — OAuth decisions, token storage, client patterns
- `.claude/skills/oura/scripts/client.mjs` — `ouraGet`, `ouraGetWithRetry`, `formatError` — the API client layer this phase builds on
- `.claude/skills/oura/scripts/auth.mjs` — `readTokens` — token management used by client.mjs
- `.claude/skills/oura/SKILL.md` — Existing skill entry point, commands, error table — must be extended with new commands

### Project
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — DASH-01, DASH-02, DASH-03, DATA-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ouraGetWithRetry(path, params)` in `client.mjs` — authenticated API calls with full error handling and retry logic
- `formatError(error)` in `client.mjs` — maps error codes to user-friendly messages
- `readTokens()` in `auth.mjs` — token management with auto-refresh
- `SKILL.md` — existing command structure (`/oura auth`, `/oura status`) to extend

### Established Patterns
- Scripts are ESM `.mjs` files in `.claude/skills/oura/scripts/`
- Scripts output to stdout; Claude reads and interprets the output for the user
- `ouraGetWithRetry` handles all error scenarios including `DATA_NOT_SYNCED` (empty data arrays)
- SKILL.md instructs Claude how to run scripts and interpret results

### Integration Points
- New data-fetch script(s) import `ouraGetWithRetry` from `client.mjs`
- SKILL.md must be updated with `/oura` dashboard command and `/oura profile` command
- `DATA_NOT_SYNCED` error from `client.mjs` maps directly to the "section collapsed" behavior for unsynced scores

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-daily-dashboard*
*Context gathered: 2026-03-22*
