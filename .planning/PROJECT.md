# Agent Oura

## What This Is

A distributable Claude Code skill that connects to the Oura Ring API v2, giving users a health dashboard and natural-language data analysis for their sleep, readiness, activity, stress, and biometric data. Built with the skill-creator pattern so anyone with an Oura ring can install and use it.

## Core Value

Users can instantly see their daily health status and ask questions about their Oura data without leaving Claude Code.

## Requirements

### Validated

- [x] OAuth2 authentication flow for Oura API (multi-user, distributable) — Validated in Phase 01: auth-and-api-client
- [x] Daily health dashboard showing sleep, readiness, activity, and stress scores — Validated in Phase 02: daily-dashboard
- [x] Personal info retrieval (ring config, user profile) — Validated in Phase 02: daily-dashboard

### Active

- [ ] OAuth2 authentication flow for Oura API (multi-user, distributable)
- [ ] Natural-language queries against Oura data (e.g., "how did I sleep this week?")
- [ ] Support for all major Oura API v2 endpoints (sleep, activity, readiness, heart rate, SpO2, stress, workouts, sessions, tags)
- [ ] Date range querying with sensible defaults
- [ ] Trend analysis and insights over time periods
- [ ] Installable as a Claude Code skill via skill-creator pattern

### Out of Scope

- Mobile app or web UI — this is a Claude Code skill only
- Webhook/subscription management — read-only data access for v1
- Writing data back to Oura — API is read-only
- Real-time streaming — Oura data updates periodically, not in real-time

## Context

- Oura Ring API v2 base URL: `https://api.ouraring.com`
- Authentication: OAuth2 (PATs are being deprecated)
- API docs: https://cloud.ouraring.com/v2/docs
- Key endpoints: daily_activity, daily_readiness, daily_sleep, daily_spo2, daily_stress, heartrate, sleep, workout, session, enhanced_tag, personal_info, ring_configuration, rest_mode_period, sleep_time
- Most endpoints accept `start_date`, `end_date` query params (YYYY-MM-DD)
- Heart rate endpoint uses `start_datetime`, `end_datetime` (ISO 8601)
- User has the OpenAPI JSON spec file available for reference
- Built using Claude Code skill-creator pattern for distribution

## Constraints

- **Auth**: Must use OAuth2 — personal access tokens are deprecated
- **Distribution**: Must be installable by other Claude Code users as a skill
- **API**: Read-only access — Oura API v2 does not support writes for health data
- **Rate limits**: Oura API has rate limits; skill should handle gracefully

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OAuth2 over PAT | PATs are deprecated by Oura; OAuth2 required for multi-user distribution | Implemented in Phase 01 |
| Skill-creator pattern | User wants distributable skill, not a standalone app | SKILL.md entry point created in Phase 01 |
| Dashboard + query dual mode | Dashboard for quick check-in, NL queries for deeper analysis | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-22 after Phase 01 completion*
