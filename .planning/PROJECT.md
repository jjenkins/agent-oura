# Agent Oura

## What This Is

A distributable Claude Code skill that connects to the Oura Ring API v2, giving users a health dashboard and natural-language data analysis for their sleep, readiness, activity, stress, and biometric data. Built with the skill-creator pattern so anyone with an Oura ring can install and use it.

## Core Value

Users can instantly see their daily health status and ask questions about their Oura data without leaving Claude Code.

## Requirements

### Validated

- ✓ OAuth2 authentication flow for Oura API (multi-user, distributable) — v1.0
- ✓ Token persistence across sessions with atomic single-use refresh handling — v1.0
- ✓ Daily health dashboard showing sleep, readiness, activity, and stress scores — v1.0
- ✓ Personal info retrieval (ring config, user profile) — v1.0
- ✓ Natural-language queries against Oura data — v1.0
- ✓ Support for all major Oura API v2 endpoints (sleep, activity, readiness, heart rate, SpO2, stress, workouts, sessions, tags) — v1.0
- ✓ Date range querying with sensible defaults — v1.0
- ✓ Trend analysis and insights over time periods — v1.0
- ✓ Correlation analysis across metrics (Pearson r) — v1.0
- ✓ Installable as a Claude Code skill via skill-creator pattern — v1.0
- ✓ Per-user credential configuration (setup.mjs + ~/.oura/config.json) — v1.0
- ✓ One-command installer script for distribution — v1.0
- ✓ Typed error handling (429 retry, 401/403 re-auth, membership required, sync delay) — v1.0

### Active

(none — planning next milestone)

### Out of Scope

- Mobile app or web UI — this is a Claude Code skill only
- Webhook/subscription management — read-only data access
- Writing data back to Oura — API is read-only
- Real-time streaming — Oura data updates periodically, not in real-time
- Local database / data warehouse — fresh-fetch is simpler; 60-day API limit
- Rich ASCII charts / sparklines — fragile across terminals; Claude's text formatting is the primary interface

## Context

Shipped v1.0 with ~12,369 LOC across 59 files.
Tech stack: Node.js 22+ (ESM .mjs scripts), native fetch, built-in http/crypto/fs modules.
No external HTTP dependencies — uses Node.js built-in fetch and http for OAuth callback.
Token storage: ~/.oura/tokens.json (atomic write via fs.rename).
Config storage: ~/.oura/config.json (per-user client_id/client_secret).
Distribution: git clone installer + SKILL.md skill-creator pattern.

## Constraints

- **Auth**: Must use OAuth2 — personal access tokens are deprecated
- **Distribution**: Must be installable by other Claude Code users as a skill
- **API**: Read-only access — Oura API v2 does not support writes for health data
- **Rate limits**: Oura API has rate limits (~5000 req/5min); skill handles with backoff retry

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OAuth2 over PAT | PATs are deprecated by Oura; OAuth2 required for multi-user distribution | ✓ Good — v1.0 |
| Skill-creator pattern | User wants distributable skill, not a standalone app | ✓ Good — v1.0 |
| Dashboard + query dual mode | Dashboard for quick check-in, NL queries for deeper analysis | ✓ Good — v1.0 |
| Per-user config file at ~/.oura/config.json | Enables distribution — each user configures their own credentials | ✓ Good — v1.0 |
| Git clone installer over curl file enumeration | All Claude Code users have git; simpler and more maintainable | ✓ Good — v1.0 |
| Node.js built-in http for OAuth callback | Same runtime as .mjs scripts, zero extra dependency vs Python http.server | ✓ Good — v1.0 |
| Plain fs.rename() for atomic token writes | Avoids write-file-atomic package; native is sufficient | ✓ Good — v1.0 |
| Claude as NLP layer (no NLP library) | SKILL.md instructs Claude to route queries; no parsing code needed | ✓ Good — v1.0 |

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
*Last updated: 2026-03-22 after v1.0 milestone*
