# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-22
**Phases:** 5 | **Plans:** 10 | **Commits:** 66

### What Was Built
- Full OAuth2 authentication with atomic token persistence and transparent refresh
- Daily health dashboard (readiness, sleep, activity, stress) with graceful degradation
- Natural-language query routing with Claude as the NLP layer
- Pearson correlation analysis across any two Oura metrics
- Per-user credential config and one-command installer for distribution
- Integration cleanup closing 3 audit issues (orphaned export, auth masking, edge case messaging)

### What Worked
- Zero external HTTP dependencies — Node.js 22 built-in fetch and http were sufficient for all API and OAuth needs
- Promise.allSettled pattern for dashboard enabled partial data display when some endpoints haven't synced
- Claude-as-NLP-layer pattern eliminated need for any NLP parsing code — SKILL.md instructions handle all routing
- Milestone audit before completion caught 3 real integration issues that Phase 5 fixed
- Atomic write pattern (tmp -> rename) reused across token and config storage

### What Was Inefficient
- Phase 1 VERIFICATION.md had human_needed items (OAuth flow, token refresh) that couldn't be automated — manual testing gap persists
- SUMMARY.md files lacked requirements_completed frontmatter — had to extract accomplishments from one-liner fields instead
- Some one-liner fields in SUMMARY.md were malformed ("One-liner:", "Commit:") — auto-extraction produced garbage that needed manual cleanup

### Patterns Established
- ouraGet (classify errors) + ouraGetWithRetry (user messaging) separation of concerns
- Dashboard imports ouraGet directly for typed error handling; other scripts use ouraGetWithRetry
- ~/.oura/ directory convention for all user-local state (tokens.json, config.json)
- SKILL.md as the sole orchestration layer — all scripts output to stdout, Claude interprets

### Key Lessons
1. Milestone audit is worth the overhead — it found real integration bugs that would have shipped
2. Node.js built-in modules are sufficient for CLI tools; avoid npm dependencies when possible
3. SKILL.md instructions are the primary "code" for a Claude Code skill — script logic should be minimal
4. Single-use refresh tokens require atomic persistence or you risk permanent lockout

### Cost Observations
- Sessions: ~5 (init, phases 1-3, phase 4, audit+phase 5, milestone completion)
- Notable: Entire MVP built in 2 calendar days across all phases

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 66 | 5 | Initial build — established all patterns |

### Cumulative Quality

| Milestone | Requirements | Coverage | Integration Issues |
|-----------|-------------|----------|-------------------|
| v1.0 | 21/21 | 100% | 3 found in audit, all fixed in Phase 5 |

### Top Lessons (Verified Across Milestones)

1. Run milestone audit before shipping — catches real integration bugs
2. Zero-dependency approach scales well for CLI skills
