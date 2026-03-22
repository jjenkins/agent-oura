# Roadmap: Agent Oura

## Overview

Build a distributable Claude Code skill that connects to the Oura Ring API v2. The work proceeds in a strict dependency order dictated by the architecture: authentication and the API client must be solid before anything else can be built; the daily dashboard follows once the client layer is validated; natural language query routing and extended data types come next, building on working infrastructure; distribution packaging comes last when internals are stable.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Auth and API Client** - Secure OAuth2 flow, token persistence, and authenticated HTTP client with error handling
- [ ] **Phase 2: Daily Dashboard** - Unified health dashboard showing readiness, sleep, activity, and stress scores
- [ ] **Phase 3: Queries and Extended Data** - Natural language query routing and remaining data types (workouts, sessions, SpO2, heart rate)
- [ ] **Phase 4: Distribution** - Installable skill packaging, setup script, and user documentation

## Phase Details

### Phase 1: Auth and API Client
**Goal**: Users can authenticate with the Oura API and the skill can make reliable, error-handled requests to any endpoint
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. User can run the auth command, complete the browser OAuth2 flow, and receive confirmation that tokens are stored
  2. After closing and reopening Claude Code, the skill works without re-authenticating (tokens persisted across sessions)
  3. When an access token expires, the skill transparently refreshes it and continues without user intervention
  4. When the Oura API returns a 429 rate limit response, the skill retries with backoff and reports progress to the user rather than failing silently
  5. When an auth error (401/403) cannot be resolved by token refresh, the user sees clear instructions to re-authenticate
**Plans**: TBD

### Phase 2: Daily Dashboard
**Goal**: Users can invoke the skill and immediately see today's complete health picture with scores and top contributors
**Depends on**: Phase 1
**Requirements**: DASH-01, DASH-02, DASH-03, DATA-05
**Success Criteria** (what must be TRUE):
  1. Invoking `/oura` displays readiness, sleep, activity, and stress scores for today in a readable format
  2. The dashboard shows the top contributing factors for readiness and sleep scores alongside the scores themselves
  3. When today's data has not yet synced, the dashboard shows the most recent available data with a clear indication of the date rather than an error
  4. User can retrieve their personal profile and ring configuration information
**Plans**: TBD

### Phase 3: Queries and Extended Data
**Goal**: Users can ask natural-language questions about their Oura data and access all data types including workouts, sessions, SpO2, and heart rate
**Depends on**: Phase 2
**Requirements**: NLQ-01, NLQ-02, NLQ-03, NLQ-04, DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. User can ask "how did I sleep this week?" and receive a summary drawn from the correct date range and endpoint
  2. User can ask a trend question like "how has my readiness trended over the last 30 days?" and receive a time-series summary
  3. User can ask correlation questions like "does my sleep score affect my readiness the next day?" and receive a cross-metric analysis
  4. User can retrieve workout summaries, session data, SpO2 averages, and heart rate data through natural language or direct commands
**Plans**: TBD

### Phase 4: Distribution
**Goal**: Any Claude Code user can install and configure the skill from scratch without guidance beyond the included documentation
**Depends on**: Phase 3
**Requirements**: DIST-01, DIST-02
**Success Criteria** (what must be TRUE):
  1. A user following the setup instructions can install the skill, register their own Oura developer app, configure credentials, and complete first-run auth without outside help
  2. The skill is installable via the Claude Code skill-creator pattern and appears as a usable skill after installation
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth and API Client | 0/TBD | Not started | - |
| 2. Daily Dashboard | 0/TBD | Not started | - |
| 3. Queries and Extended Data | 0/TBD | Not started | - |
| 4. Distribution | 0/TBD | Not started | - |
