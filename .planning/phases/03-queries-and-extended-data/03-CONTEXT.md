# Phase 3: Queries and Extended Data - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Natural-language query routing and remaining data types (workouts, sessions, SpO2, heart rate). Users can ask questions about their Oura data and Claude routes to the correct endpoint with the right date range. Includes trend analysis over time periods and correlation analysis across metrics. Does NOT include web UI, data persistence, or write operations.

</domain>

<decisions>
## Implementation Decisions

### Query routing strategy
- **D-01:** Generic query script (`query.mjs`) that takes endpoint + date params as CLI args (e.g., `node query.mjs daily_sleep --start 2026-03-15 --end 2026-03-21`). Claude maps natural-language questions to the right endpoint and dates.
- **D-02:** Claude is the NLP layer -- no natural-language parsing in the script itself. Script takes explicit params, Claude figures out intent.
- **D-03:** No dedicated `/oura sleep`, `/oura activity` etc. commands -- Claude uses natural language routing to decide what to run. SKILL.md instructs Claude how to map questions to query.mjs calls.
- **D-04:** Claude can combine data from multiple endpoints in one answer (e.g., "how was my week?" pulls sleep + readiness + activity by making multiple query.mjs calls or using multi-endpoint mode).
- **D-05:** Output format is JSON -- Claude parses and summarizes for the user. No plaintext formatting in the script.
- **D-06:** When a question is ambiguous (e.g., "how am I doing?"), Claude defaults to showing everything rather than asking for clarification.

### Date range defaults and controls
- **D-07:** Default date range when unspecified is last 7 days
- **D-08:** Maximum lookback is ~60 days (Oura API limit). When the user asks for data beyond 60 days, Claude should inform them that the data is beyond what can be looked up, not silently cap.
- **D-09:** "Today" queries (e.g., "how did I sleep last night?") route to the existing dashboard script, which already handles today's data with sorted contributors. Query script is for multi-day ranges.
- **D-10:** Heart rate endpoint uses `start_datetime`/`end_datetime` (ISO 8601) instead of `start_date`/`end_date`. The query script handles both parameter styles internally based on the endpoint being queried.

### Extended data types
- **D-11:** No separate scripts for workouts, sessions, SpO2, or heart rate. The generic `query.mjs` handles all endpoints. Claude interprets the JSON response fields.
- **D-12:** Existing `client.mjs` error handling (MEMBERSHIP_REQUIRED, etc.) covers extended data types -- no special handling needed.
- **D-13:** Workouts return all types in the date range. Claude filters by type in its summary if the user asks about a specific workout type. No `--type` filter in the script.

### Trend analysis
- **D-14:** The query script computes summary stats for trend queries: average, min, max, trend direction. Claude uses these computed stats rather than interpreting raw data points.
- **D-15:** Raw daily records are also included in the JSON output alongside the summary, so Claude can reference specific days as examples.

### Correlation analysis
- **D-16:** Multi-endpoint mode or dedicated correlation tool -- the script fetches two endpoints for the same date range in a single invocation, so Claude doesn't need to make two separate calls and cross-reference.
- **D-17:** Three-tier correlation architecture:
  1. **Hard stats layer (script):** Script computes Pearson correlation coefficient (r) as the deterministic math layer. This ensures observations are anchored in reality, not LLM pattern-matching on a few coincidental days.
  2. **Semantic bridge (script output):** Script translates r into a strict semantic category passed in JSON: r >= 0.7 = "Strong Positive", 0.3 <= r < 0.7 = "Moderate Positive", -0.3 < r < 0.3 = "No Significant Correlation" (and mirrored for negative values: r <= -0.7 = "Strong Negative", -0.7 < r <= -0.3 = "Moderate Negative").
  3. **User experience (Claude):** Claude receives the semantic category and raw data, then explains the relationship conversationally with 1-2 specific day examples. User never sees r-values or statistical jargon.
- **D-18:** Time-shifted correlations (e.g., "does last night's sleep affect today's readiness?") are handled by the script via an offset alignment mechanism. The script aligns metric A[day N] with metric B[day N+offset] before computing correlation.

### Claude's Discretion
- Exact CLI argument names and format for query.mjs
- How to structure the JSON output (flat vs nested)
- Which summary stats to include beyond avg/min/max
- How to present multi-endpoint results conversationally
- Correlation output JSON structure details
- Whether to include a `--offset` flag or infer offset from the endpoint pair

</decisions>

<specifics>
## Specific Ideas

- The query script is a "dumb pipe with math" -- it fetches, computes stats, outputs JSON. Claude is the intelligence layer.
- Correlation architecture: script = deterministic data scientist (accuracy), Claude = empathetic presentation layer (insight). The semantic bridge prevents Claude from inventing correlations or regurgitating raw statistics.
- SKILL.md instructions should tell Claude: "The system has determined there is a [category] correlation. Explain this relationship in a helpful, conversational way, pointing out 1-2 specific days from the raw data as examples."

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Oura API
- `.planning/research/STACK.md` -- Technology recommendations, script patterns (ESM .mjs, stdout for Claude)
- `.planning/research/ARCHITECTURE.md` -- Component boundaries, data flow
- `.planning/research/PITFALLS.md` -- Date format differences (start_date vs start_datetime for heart rate), sync delays, API response shapes

### Prior phases
- `.planning/phases/01-auth-and-api-client/01-CONTEXT.md` -- OAuth decisions, token storage, client patterns
- `.planning/phases/02-daily-dashboard/02-CONTEXT.md` -- Dashboard decisions, contributor display, sync handling
- `.claude/skills/oura/scripts/client.mjs` -- `ouraGet`, `ouraGetWithRetry`, `formatError` -- the API client layer
- `.claude/skills/oura/scripts/dashboard.mjs` -- Daily dashboard pattern (Promise.allSettled, extractRecord, sortedContributors)
- `.claude/skills/oura/SKILL.md` -- Existing skill entry point, must be extended with query instructions

### Project
- `.planning/PROJECT.md` -- Core value, constraints
- `.planning/REQUIREMENTS.md` -- NLQ-01 through NLQ-04, DATA-01 through DATA-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ouraGet(path, params)` in `client.mjs` -- authenticated GET with typed error classification (DATA_NOT_SYNCED, RATE_LIMITED, etc.)
- `ouraGetWithRetry(path, params)` in `client.mjs` -- retry wrapper, converts errors to user-friendly strings. Suitable for query.mjs since partial-failure logic isn't needed (one endpoint per call, or handled differently for correlation mode).
- `formatError(error)` in `client.mjs` -- error code to message mapping
- `dashboard.mjs` pattern -- Promise.allSettled for parallel fetch, extractRecord for safe data extraction

### Established Patterns
- Scripts are ESM `.mjs` files in `.claude/skills/oura/scripts/`
- Scripts output to stdout; Claude reads and interprets
- `ouraGet` throws typed errors; callers classify by `err.message`
- Date derivation uses `toLocaleDateString('en-CA')` for local timezone YYYY-MM-DD
- SKILL.md instructs Claude how to run each script and interpret output

### Integration Points
- `query.mjs` imports from `client.mjs` (ouraGet or ouraGetWithRetry)
- SKILL.md must be updated with query routing instructions for Claude
- Dashboard script (`/oura`) remains the entry point for "today" queries
- Heart rate endpoint requires different date param names (start_datetime/end_datetime)

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 03-queries-and-extended-data*
*Context gathered: 2026-03-22*
