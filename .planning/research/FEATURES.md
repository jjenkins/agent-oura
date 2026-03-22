# Feature Research

**Domain:** CLI-based health data skill — Oura Ring API integration for Claude Code
**Researched:** 2026-03-21
**Confidence:** HIGH (Oura API endpoints well-documented, comparable tools surveyed)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OAuth2 authentication flow | PATs deprecated end-2025; only auth method available | MEDIUM | Requires PKCE or server-side code exchange, token storage, refresh logic |
| Today's readiness score with contributors | Every Oura user checks readiness daily; 7 contributors expected | LOW | `daily_readiness` endpoint; show score + HRV balance, sleep, activity, resting HR, body temp |
| Today's sleep score with contributors | Sleep is primary Oura use case; users expect last-night data | LOW | `daily_sleep` endpoint; score + deep/REM/efficiency/latency/timing breakdown |
| Today's activity summary | Step count, active calories, goal progress are standard wearable output | LOW | `daily_activity` endpoint; steps, calories, activity score |
| Token persistence across sessions | Users cannot re-authenticate every Claude Code session | MEDIUM | Secure local token file with refresh logic; respect 60-day cache limit per Oura API agreement |
| Date range querying | All existing Oura tools support this; users expect historical lookup | LOW | Most endpoints accept `start_date`/`end_date` (YYYY-MM-DD); heart rate uses ISO 8601 |
| Graceful error handling (rate limits, expired tokens) | Oura limits to 5,000 req/5min; tokens expire; silent failures frustrate users | MEDIUM | 429 retry logic, auto-refresh on 401, human-readable error messages |
| Current stress level | Stress is a core Gen3 feature users track daily | LOW | `daily_stress` endpoint; stress high/low/restore scores |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Natural language queries against Oura data | Claude Code users expect to ask "how did I sleep this week?" not run commands | HIGH | Claude's native strength; requires fetching relevant data ranges, formatting for LLM context |
| Trend analysis with plain-English interpretation | Raw scores are useful; what they mean over time is the insight users actually want | HIGH | Weekly/monthly averages, directional change ("HRV trending down this week"), deviation from personal baseline |
| Correlation queries | Power users want "does alcohol affect my HRV?" — no other CLI tool does this | HIGH | Requires fetching multiple metric types over same date range + Claude analysis |
| Unified dashboard (all scores at once) | Saves the user from running 3 separate lookups; mirrors what Oura app shows | LOW | Aggregate daily_readiness + daily_sleep + daily_activity + daily_stress in one command |
| Sleep detail drill-down | `sleep` endpoint (vs `daily_sleep`) contains 5-minute interval HR, HRV, sleep stages — richer than score summaries | MEDIUM | Distinguish `/usercollection/sleep` (detailed) from `/usercollection/daily_sleep` (scored) |
| Workout and session summary | Oura tracks workouts and guided sessions; athletes care about these | LOW | `workout` and `session` endpoints; type, duration, HR, source |
| SpO2 and heart rate data | Blood oxygen and raw HR data are biometric power features; early illness detection use case | MEDIUM | `daily_spo2` for averaged data; `heartrate` endpoint for 5-min interval data with different datetime params |
| Ring and profile info | Useful for diagnosing issues ("which generation ring?") and personalizing output | LOW | `ring_configuration` + `personal_info` endpoints |
| Sandbox/test mode support | Developers extending the skill can test without real ring data | LOW | Oura provides a sandbox environment; can be toggled via env var |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Webhook / real-time subscriptions | "Get notified when my data updates" sounds appealing | Out of scope for a read-only CLI skill; requires a persistent server to receive callbacks; Oura data is batch-updated, not real-time anyway | Poll on demand with sensible defaults; design date queries to feel fresh |
| Writing data back to Oura (tags, workouts) | Users want to log coffee, alcohol, workouts via Claude | Oura API v2 does not support writes for health metrics (read-only); building around unsupported writes will break | Support `enhanced_tag` read access; suggest users log in the Oura app |
| Persistent local database / data warehouse | "Store all my history locally" is a reasonable ETL pattern | Adds significant complexity (schema, migrations, sync logic) with 60-day cache limit constraint and security surface for health data | Cache only recent fetches (last 7-30 days) in simple JSON; fresh-fetch for older ranges |
| Rich terminal charts / ASCII visualizations | Sparklines and bar charts in terminal look impressive in demos | ASCII charting libraries are fragile across terminal sizes and color schemes; adds a dependency for marginal UX gain in a tool where Claude's text is the primary interface | Use Claude's text formatting (markdown tables, ranges, percentages) for trend data |
| Web UI or mobile companion | Users may want a "real" dashboard eventually | Explicitly out of scope (PROJECT.md); mixing CLI skill with UI delivery fragments both | Stay terminal-first; Oura app covers GUI needs |
| Multi-ring / household support | "What if my spouse also uses Oura?" | OAuth2 flow binds one token set per user; multi-user requires per-user credential management, expanding scope significantly | Design clean per-user token storage so multi-user is possible in v2 without blocking v1 |

## Feature Dependencies

```
[OAuth2 Auth Flow]
    └──requires──> [Token Storage + Refresh]
                       └──enables──> [All API Data Endpoints]

[All API Data Endpoints]
    └──enables──> [Dashboard (unified today view)]
    └──enables──> [Date Range Queries]
                       └──enables──> [Trend Analysis]
                                         └──enables──> [Correlation Queries]

[Natural Language Queries]
    └──requires──> [Date Range Queries]
    └──requires──> [Dashboard]
    └──enhances──> [Trend Analysis]

[Sleep Detail Drill-down]
    └──requires──> [Date Range Queries]
    └──supplements──> [Dashboard (sleep score)]

[SpO2 + Heart Rate]
    └──requires──> [Date Range Queries]
    └──uses different param format──> [heartrate endpoint uses ISO 8601 datetime, not date]
```

### Dependency Notes

- **OAuth2 Auth Flow requires Token Storage + Refresh:** The Oura API issues short-lived access tokens. Without refresh logic, the skill stops working within hours. Refresh token is single-use; storage must update on each refresh.
- **Trend Analysis requires Date Range Queries:** Trend analysis is just date-range queries + aggregation + interpretation. Build date-range queries correctly and trends follow naturally.
- **Correlation Queries require Trend Analysis:** Correlating two metrics (e.g., alcohol tags vs HRV) requires fetching both over a date range; Trend Analysis patterns establish how to do this.
- **Natural Language Queries require Dashboard + Date Range:** NL queries need to know which endpoint to call and what date range makes sense. These must be solid before NL routing is reliable.
- **SpO2/heart rate conflict with sleep endpoint date params:** `heartrate` endpoint uses `start_datetime`/`end_datetime` (ISO 8601) not `start_date`/`end_date`. Must handle both param formats to avoid silent failures.

## MVP Definition

### Launch With (v1)

Minimum viable product — validates the core "instant health status in Claude Code" premise.

- [ ] OAuth2 authentication flow with token storage and refresh — without this, nothing works
- [ ] Unified daily dashboard: readiness + sleep + activity + stress scores with top contributors — core value proposition in one command
- [ ] Date range querying for all major daily endpoints — enables "how was last week?" before NL routing exists
- [ ] Natural language query routing — primary differentiator; Claude decides which endpoint + date range based on user's question
- [ ] Graceful 429 / 401 error handling — prevents silent failures that make the tool feel broken

### Add After Validation (v1.x)

Features to add once core is working and real usage patterns are clear.

- [ ] Trend analysis with plain-English interpretation — add once users are making date-range queries and asking follow-up questions
- [ ] Sleep detail drill-down (interval HR, HRV, sleep stages) — add when users ask "why was my sleep score low?" and summary data isn't enough
- [ ] Workout and session summaries — add when athletes report missing this data
- [ ] SpO2 + raw heart rate data — add when users want biometric depth beyond daily summaries

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Correlation queries (e.g., behavior-to-metric correlations) — high value but high complexity; needs good data coverage first
- [ ] Sandbox/test mode — useful for contributors; defer until others are extending the skill
- [ ] Ring and profile info commands — low urgency; users rarely need this day-to-day
- [ ] Multi-user credential management — architectural decision; design token storage to support it without building it yet

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| OAuth2 auth + token storage | HIGH | MEDIUM | P1 |
| Unified daily dashboard | HIGH | LOW | P1 |
| Date range queries | HIGH | LOW | P1 |
| Natural language query routing | HIGH | MEDIUM | P1 |
| Error handling (429/401) | HIGH | MEDIUM | P1 |
| Trend analysis (plain-English) | HIGH | HIGH | P2 |
| Sleep detail drill-down | MEDIUM | MEDIUM | P2 |
| Workout / session summaries | MEDIUM | LOW | P2 |
| SpO2 + heart rate data | MEDIUM | MEDIUM | P2 |
| Correlation queries | HIGH | HIGH | P3 |
| Sandbox test mode | LOW | LOW | P3 |
| Ring/profile info | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Oura App (native) | oura-telegram-reports (OSS bot) | hedgertronic/oura-ring (Python) | Our Approach |
|---------|-------------------|---------------------------------|----------------------------------|--------------|
| Daily scores | Score + contributors, full UI | Scheduled push summaries | Raw data fetch, no formatting | Formatted terminal output, on-demand |
| Trend analysis | 7/30/90-day charts in app | Weekly/monthly reports with sparklines | DataFrame export for manual analysis | Plain-English interpretation via Claude |
| Natural language queries | No | "How does coffee affect my sleep?" (Claude-powered) | No | Core feature — Claude Code native |
| Correlation | Built-in "compare two metrics" UI | Event logging + correlation | Manual with pandas | NL query ("does alcohol affect HRV?") |
| Authentication | App-native | OAuth2 with stored tokens | Personal access token (deprecated) | OAuth2 with secure local token file |
| Distribution | App store | Self-hosted | pip install | Claude Code skill-creator pattern |
| Workout/session data | Full UI | Not mentioned | Supported | Supported via API endpoints |
| SpO2 / HR raw | Full UI | HR + SpO2 tracked | Supported | Supported; different date param format required |

## Sources

- [Oura API v2 Documentation](https://cloud.ouraring.com/v2/docs) — endpoint reference
- [Oura Readiness Score breakdown](https://ouraring.com/blog/readiness-score/) — 7 contributor model
- [oura-telegram-reports (OSS)](https://github.com/seoshmeo/oura-telegram-reports) — feature set for AI-powered Oura bot
- [hedgertronic/oura-ring (OSS)](https://github.com/hedgertronic/oura-ring) — Python client feature set
- [Pinta365/oura_api TypeScript library](https://jsr.io/@pinta365/oura-api/doc) — OAuth2 flow methods
- [Apple Health MCP Server use cases](https://www.themomentum.ai/blog/apple-health-mcp-server-use-cases-for-developers) — NL query patterns for health data
- [Oura API Agreement (caching rules)](https://cloud.ouraring.com/legal/api-agreement) — 60-day cache limit, rate limits
- [Oura API Error Handling](https://cloud.ouraring.com/docs/error-handling) — 429 rate limit details (5000 req/5min)
- [Oura Trends documentation](https://support.ouraring.com/hc/en-us/articles/360055983614-Using-Trends) — trend view patterns
- [Developer wellness dashboard guide](https://www.wellally.tech/blog/build-wellness-dashboard-oura-api) — OAuth2 flow patterns

---
*Feature research for: CLI health data skill — Oura Ring API integration for Claude Code*
*Researched: 2026-03-21*
