# Requirements: Agent Oura

**Defined:** 2026-03-21
**Core Value:** Users can instantly see their daily health status and ask questions about their Oura data without leaving Claude Code.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can authenticate via OAuth2 flow with Oura API
- [x] **AUTH-02**: User tokens persist across Claude Code sessions in secure local storage
- [x] **AUTH-03**: Expired access tokens auto-refresh using stored refresh token
- [x] **AUTH-04**: Single-use refresh tokens are atomically persisted on each refresh

### Dashboard

- [x] **DASH-01**: User can invoke skill and see today's readiness, sleep, activity, and stress scores
- [x] **DASH-02**: Dashboard shows top contributors for readiness and sleep scores
- [x] **DASH-03**: Dashboard gracefully handles missing data when today's scores haven't synced yet

### Natural Language Queries

- [x] **NLQ-01**: User can ask natural-language questions about their Oura data
- [x] **NLQ-02**: Skill routes questions to the correct API endpoint and date range
- [x] **NLQ-03**: User can query trend analysis over configurable time periods
- [x] **NLQ-04**: User can ask correlation questions across multiple metrics

### Extended Data

- [x] **DATA-01**: User can view workout summaries (type, duration, intensity)
- [x] **DATA-02**: User can view session data (guided/unguided sessions)
- [x] **DATA-03**: User can view SpO2 (blood oxygen) data
- [x] **DATA-04**: User can view heart rate data (5-minute intervals, ISO 8601 datetime params)
- [x] **DATA-05**: User can view ring configuration and personal profile info

### Error Handling

- [x] **ERR-01**: Rate limit (429) responses are handled with retry logic and user feedback
- [x] **ERR-02**: Auth errors (401/403) trigger auto-refresh or clear re-auth instructions
- [x] **ERR-03**: Missing data scenarios show helpful messages (sync delay, membership required)

### Distribution

- [ ] **DIST-01**: Skill is installable by other Claude Code users via skill-creator pattern
- [ ] **DIST-02**: Setup instructions guide users through OAuth app registration and credential configuration

## v2 Requirements

### Advanced Analysis

- **ADV-01**: User can compare metrics across custom date ranges side-by-side
- **ADV-02**: User receives personalized health recommendations based on trends

### Extended Features

- **EXT-01**: Sandbox/test mode for developers without Oura ring
- **EXT-02**: Sleep detail drill-down with interval HR, HRV, and sleep stage data
- **EXT-03**: Multi-user credential management for household use

## Out of Scope

| Feature | Reason |
|---------|--------|
| Webhook/subscription management | Requires persistent server; out of scope for CLI skill |
| Writing data back to Oura | Oura API v2 is read-only for health data |
| Web UI or mobile companion | This is a Claude Code skill only; Oura app covers GUI |
| Local database / data warehouse | Adds complexity; 60-day cache limit constraint; fresh-fetch is simpler |
| Rich ASCII charts / sparklines | Fragile across terminals; Claude's text formatting is the primary interface |
| Real-time streaming | Oura data updates periodically via sync, not in real-time |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| ERR-01 | Phase 1 | Complete |
| ERR-02 | Phase 1 | Complete |
| ERR-03 | Phase 1 | Complete |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 2 | Complete |
| DASH-03 | Phase 2 | Complete |
| DATA-05 | Phase 2 | Complete |
| NLQ-01 | Phase 3 | Complete |
| NLQ-02 | Phase 3 | Complete |
| NLQ-03 | Phase 3 | Complete |
| NLQ-04 | Phase 3 | Complete |
| DATA-01 | Phase 3 | Complete |
| DATA-02 | Phase 3 | Complete |
| DATA-03 | Phase 3 | Complete |
| DATA-04 | Phase 3 | Complete |
| DIST-01 | Phase 4 | Pending |
| DIST-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
