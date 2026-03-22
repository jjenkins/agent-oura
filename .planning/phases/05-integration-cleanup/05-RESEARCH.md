# Phase 5: Integration Cleanup - Research

**Researched:** 2026-03-22
**Domain:** Node.js ESM script wiring, error propagation, edge-case message routing
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ERR-01 | Rate limit (429) responses are handled with retry logic and user feedback | INT-01 fix must preserve existing RATE_LIMITED handling in ouraGetWithRetry |
| ERR-02 | Auth errors (401/403) trigger auto-refresh or clear re-auth instructions | INT-02 fix directly enables correct auth-error reporting in dashboard.mjs |
| ERR-03 | Missing data scenarios show helpful messages (sync delay, membership required) | INT-02 and INT-03 fixes ensure the right error variant surfaces per context |
| DASH-03 | Dashboard gracefully handles missing data when today's scores haven't synced yet | INT-02 fix must preserve DATA_NOT_SYNCED section-collapse while routing auth errors correctly |
| DATA-05 | User can view ring configuration and personal profile info | INT-03 fix surfaces correct message when ring_configuration is empty |
</phase_requirements>

## Summary

Phase 5 addresses three concrete integration defects found during the v1.0 milestone audit. No new libraries, architectural patterns, or API integrations are required. All three fixes are surgical edits to existing scripts.

**INT-01** — `formatError` in `client.mjs` is exported but never imported by any consumer. `ouraGetWithRetry` already converts typed error codes to user-readable strings inline; `formatError` duplicates that logic without being wired anywhere. The fix is a removal: delete the export and update the top-of-file comment.

**INT-02** — `dashboard.mjs` uses `ouraGet` directly (deliberately, to preserve typed `DATA_NOT_SYNCED` for per-section collapse). However, when `ouraGet` throws `AUTH_EXPIRED`, `AUTH_FORBIDDEN`, or `NOT_AUTHENTICATED`, those rejections flow through `extractRecord()` which silently returns `null` for any rejected promise. The all-null guard at line 39 then emits "Today's data hasn't synced yet" regardless of why the data is absent. The fix adds a pre-check before the `Promise.allSettled` call: run one cheap sentinel request through `ouraGetWithRetry` (which surfaces auth errors clearly) and exit with an auth message if it throws. Alternatively — and more precisely — inspect rejection reasons inside `extractRecord` and classify auth errors separately.

**INT-03** — `profile.mjs` calls `ouraGetWithRetry('/usercollection/ring_configuration')`. Inside `ouraGet`, any response with an empty `data` array throws `DATA_NOT_SYNCED`. `ouraGetWithRetry` converts that to "Data not yet synced. Check the Oura app and try again in a few minutes." — which is semantically wrong for an empty ring list (user has never paired a ring, or all rings were deregistered). The fix intercepts the `DATA_NOT_SYNCED` error specifically for the ring_configuration endpoint and substitutes a pairing-appropriate message; or alternatively, profile.mjs catches the error and prints the right message itself.

**Primary recommendation:** Make all three fixes as isolated edits — one per plan task — with no shared state or ordering dependency between them. INT-01 is pure deletion (no logic change). INT-02 and INT-03 are catch/inspect additions in the consumer scripts.

## Standard Stack

No new dependencies. All fixes use existing Node.js built-ins and existing script exports.

| Component | Current State | Change |
|-----------|--------------|--------|
| `client.mjs` — `formatError` | Exported, unused | Remove export + update file comment |
| `dashboard.mjs` — outer catch | Catches all errors as `err.message` string output | Add auth-error classification before catch-all |
| `profile.mjs` — catch block | Re-throws `err.message` to stderr | Add special-case for `DATA_NOT_SYNCED` on ring_configuration |

**No npm install required.**

## Architecture Patterns

### INT-01: Remove Orphaned Export

`formatError` was written to give callers a consistent way to turn typed error codes into human strings. In practice, `ouraGetWithRetry` does that inline, so callers never needed `formatError`. Removing it is safe because no file imports it — confirmed by grep across all scripts.

**Pattern:** Dead export removal.

```javascript
// BEFORE (client.mjs lines 146-170)
// --- Exported: formatError ---
// Maps error code strings to user-friendly messages for callers that catch errors.
export function formatError(error) { ... }

// AFTER: delete the function entirely.
// Also update the top comment:
// BEFORE: // Exports: ouraGet, ouraGetWithRetry, formatError
// AFTER:  // Exports: ouraGet, ouraGetWithRetry
```

**Risk:** Zero. No consumer imports it.

### INT-02: Dashboard Auth-Error Classification

`dashboard.mjs` intentionally uses raw `ouraGet` (not `ouraGetWithRetry`) so that `DATA_NOT_SYNCED` errors surface as typed codes that `extractRecord` can collapse to null per section. That design decision must be preserved.

The problem: auth errors (`AUTH_EXPIRED`, `AUTH_FORBIDDEN`, `NOT_AUTHENTICATED`) also cause all four `ouraGet` calls to reject, and they all produce null from `extractRecord`, triggering the "data hasn't synced" message.

**Best fix approach:** Inspect rejection reasons in `extractRecord` (or in the all-null guard) to distinguish DATA_NOT_SYNCED from auth failures. If any rejection carries an auth-typed error code, exit with an authentication message instead of a sync message.

```javascript
// Revised extractRecord — returns { record, authError } or { record: null }
function extractRecord(result) {
  if (result.status === 'rejected') {
    const msg = result.reason?.message ?? '';
    if (msg === 'AUTH_EXPIRED' || msg === 'AUTH_FORBIDDEN' || msg === 'NOT_AUTHENTICATED') {
      return { record: null, authError: msg };
    }
    return { record: null, authError: null };
  }
  const data = result.value?.data;
  if (!Array.isArray(data) || data.length === 0) return { record: null, authError: null };
  return { record: data[0], authError: null };
}

// Then in the all-null guard:
const authErrors = [readinessResult, sleepResult, activityResult, stressResult]
  .filter(r => r.status === 'rejected')
  .map(r => r.reason?.message)
  .find(msg => ['AUTH_EXPIRED', 'AUTH_FORBIDDEN', 'NOT_AUTHENTICATED'].includes(msg));

if (authErrors) {
  process.stderr.write('Authentication error. Run /oura auth to re-authenticate.\n');
  process.exit(1);
}

if (!readiness && !sleep && !activity && !stress) {
  process.stdout.write("Today's data hasn't synced yet. Check your Oura app.\n");
  process.exit(0);
}
```

**Simpler alternative:** Add a sentinel pre-check at the top — call `ouraGetWithRetry` on one lightweight endpoint (e.g., `/usercollection/personal_info`) before the `Promise.allSettled`. If it throws, surface the error and exit. Downside: adds one extra API call per dashboard invocation; latency cost is minor but real.

**Recommended approach:** The inspection approach (no extra API call, preserves the existing allSettled design, minimal code change).

**Risk:** Low. The check is additive — the sync-delay path still fires when rejections have non-auth reasons.

### INT-03: Ring Configuration Empty-Array Message

`ouraGet` detects `Array.isArray(json.data) && json.data.length === 0` and throws `DATA_NOT_SYNCED`. For daily data endpoints this is correct. For `ring_configuration`, an empty array means no ring has been paired — a fundamentally different user situation.

`ouraGetWithRetry` converts `DATA_NOT_SYNCED` to "Data not yet synced. Check the Oura app and try again in a few minutes." — wrong message for a device pairing problem.

**Best fix approach:** `profile.mjs` catches the error from `ouraGetWithRetry` (which has already re-thrown `DATA_NOT_SYNCED` as a friendly string) and replaces the ring-configuration-specific message. Since `Promise.all` is used, a `DATA_NOT_SYNCED` on ring_configuration throws out of the whole `await Promise.all(...)` and is caught by the outer `catch`.

However, by the time `profile.mjs` catches it, `ouraGetWithRetry` has already converted the error message to the human string ("Data not yet synced..."). The typed code `DATA_NOT_SYNCED` is gone.

Two options:

**Option A — Detect by error message text in profile.mjs catch:**
```javascript
} catch (err) {
  if (err.message.startsWith('Data not yet synced')) {
    // ring_configuration was empty — user has no paired ring
    process.stderr.write('No ring configuration found. Pair your Oura ring in the Oura app and try again.\n');
  } else {
    process.stderr.write(err.message + '\n');
  }
  process.exit(1);
}
```
Fragile — depends on the human-readable string from `ouraGetWithRetry`.

**Option B — Use ouraGet directly for ring_configuration, not ouraGetWithRetry:**
Call `ouraGetWithRetry` only for `personal_info`, and call `ouraGet` directly for `ring_configuration`. Catch the typed `DATA_NOT_SYNCED` error from `ouraGet` and emit the pairing message:

```javascript
const [personalInfo, ringConfigRaw] = await Promise.all([
  ouraGetWithRetry('/usercollection/personal_info'),
  ouraGet('/usercollection/ring_configuration').catch(err => {
    if (err.message === 'DATA_NOT_SYNCED') return { data: [] }; // treat as empty, show pairing msg
    throw err; // re-throw auth/rate errors
  }),
]);

// Then after the await:
if (!ringConfigRaw.data || ringConfigRaw.data.length === 0) {
  // Show profile without ring section, with a pairing message
  lines.push('', 'Ring Configuration:');
  lines.push('  No ring paired. Open the Oura app to pair your ring.');
}
```
This is cleaner — typed error code is preserved for the ring endpoint, `personal_info` still gets full retry coverage.

**Recommended approach:** Option B. Typed code inspection is more robust than string matching. Profile output gracefully shows personal info even when no ring is configured.

**Risk:** Low. `ouraGet` is already imported by `dashboard.mjs`; `profile.mjs` just needs to add it to the import.

### Anti-Patterns to Avoid

- **String-matching human-readable error messages:** Option A for INT-03 creates a brittle coupling between `ouraGetWithRetry` output text and `profile.mjs` catch logic. Use typed error codes.
- **Adding extra API calls for auth pre-check:** The sentinel-call approach for INT-02 adds latency and burns a rate-limit token. Inspect rejection reasons instead.
- **Changing ouraGet's DATA_NOT_SYNCED behavior globally:** client.mjs handles empty data arrays correctly for daily data endpoints. Don't special-case ring_configuration inside client.mjs — that breaks separation of concerns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| User-friendly error strings | New formatting layer | `ouraGetWithRetry` already does this; `formatError` was a duplicate — removing it is the fix |
| Auth status pre-check | Separate auth probe script | Inspect rejection `.reason.message` from `Promise.allSettled` results |
| Ring config empty detection | New empty-check utility | Catch `DATA_NOT_SYNCED` from `ouraGet` at the call site in `profile.mjs` |

## Common Pitfalls

### Pitfall 1: Destroying the DATA_NOT_SYNCED Section-Collapse Behavior
**What goes wrong:** Changing `extractRecord` in a way that makes it treat DATA_NOT_SYNCED as an auth error, or changing it to throw instead of returning null.
**Why it happens:** Auth errors and DATA_NOT_SYNCED both arrive as rejected promises in `allSettled` results.
**How to avoid:** The auth-error check must only fire when at least one rejection has an auth-typed code. DATA_NOT_SYNCED rejections must continue to produce null (collapsed section), not error output.
**Warning signs:** Dashboard shows "authentication error" when a single section hasn't synced; sections that should be hidden become error messages.

### Pitfall 2: Assuming formatError is Unused Without Grepping All Consumers
**What goes wrong:** If a future script was added that imports `formatError`, deletion would break it silently (ESM import errors at runtime only).
**How to avoid:** Confirmed by grep: `formatError` appears only in `client.mjs` as definition. Zero import sites in `dashboard.mjs`, `profile.mjs`, `query.mjs`, `auth.mjs`, `setup.mjs`. Safe to remove.

### Pitfall 3: ouraGetWithRetry Re-throws DATA_NOT_SYNCED as a Human String
**What goes wrong:** Expecting to catch `err.message === 'DATA_NOT_SYNCED'` after `ouraGetWithRetry` — it's already been converted to a human-readable string.
**Why it happens:** `ouraGetWithRetry` catches typed codes and throws `new Error(humanString)`. The typed code is gone.
**How to avoid:** For INT-03, catch `DATA_NOT_SYNCED` before `ouraGetWithRetry` can convert it — use `ouraGet` directly for `ring_configuration` and catch the typed code.

### Pitfall 4: Promise.all Abort — personal_info Error Hides Ring Config Error
**What goes wrong:** If `personal_info` also fails (e.g., auth error), Promise.all rejects on the first rejection — the ring_configuration call's result is discarded.
**Why it happens:** Promise.all short-circuits on the first rejection.
**How to avoid:** This behavior is correct and intentional (profile requires both). The only new wrinkle is that ring_configuration's `DATA_NOT_SYNCED` is now caught inline with `.catch()` before Promise.all sees it, so it resolves cleanly. Auth errors still propagate out and are handled by the outer catch.

## Code Examples

### Confirmed working patterns from existing codebase

**Typed error code inspection from allSettled (INT-02 basis):**
```javascript
// dashboard.mjs — result.reason.message carries the typed code from ouraGet
const [readinessResult, ...] = await Promise.allSettled([ouraGet(...), ...]);

// result.reason is the Error thrown by ouraGet
// result.reason.message is e.g. 'AUTH_EXPIRED', 'DATA_NOT_SYNCED', etc.
```

**Inline catch on a single ouraGet call (INT-03 basis):**
```javascript
// profile.mjs — catch DATA_NOT_SYNCED before Promise.all sees it
ouraGet('/usercollection/ring_configuration').catch(err => {
  if (err.message === 'DATA_NOT_SYNCED') return { data: [] };
  throw err;
})
```

**Removing an export in ESM:**
```javascript
// BEFORE
export function formatError(error) { ... }

// AFTER — just delete the function body and export keyword.
// Update the comment at line 2:
// // Exports: ouraGet, ouraGetWithRetry
```

## State of the Art

No library changes. All three fixes use patterns already present in the codebase.

| Current State | Target State | Fix |
|---------------|-------------|-----|
| `formatError` exported, unused | Removed, not exported | Delete function + update comment |
| Auth errors in dashboard show "data hasn't synced" | Auth errors show auth message | Inspect rejection reasons in allSettled results |
| Empty ring_configuration shows sync-delay message | Empty ring_configuration shows pairing message | Catch DATA_NOT_SYNCED at ring endpoint call site |

## Open Questions

1. **Should `extractRecord` return a richer object or should the auth check live at the all-null guard?**
   - What we know: Either location works. The all-null guard fires only when all four sections are null, meaning an auth error affecting all four calls is required to trigger it.
   - What's unclear: If auth is broken, all four calls will fail with auth errors. The all-null guard fires in that case, so checking rejection reasons there is correct.
   - Recommendation: Check in the all-null guard — inspect `[readinessResult, ...]` for auth-typed rejection reasons before emitting the sync message. No need to refactor `extractRecord`.

2. **Should `profile.mjs` import both `ouraGet` and `ouraGetWithRetry`, or only `ouraGet`?**
   - What we know: `personal_info` still needs full retry coverage (currently via `ouraGetWithRetry`). Only `ring_configuration` needs the typed-code catch.
   - Recommendation: Import both. Use `ouraGetWithRetry` for `personal_info`, `ouraGet` for `ring_configuration` with inline `.catch()`.

## Sources

### Primary (HIGH confidence)
- `/Users/jim/work/src/github.com/jjenkins/agent-oura/.claude/skills/oura/scripts/client.mjs` — source of formatError and typed error codes
- `/Users/jim/work/src/github.com/jjenkins/agent-oura/.claude/skills/oura/scripts/dashboard.mjs` — extractRecord and allSettled pattern
- `/Users/jim/work/src/github.com/jjenkins/agent-oura/.claude/skills/oura/scripts/profile.mjs` — ring_configuration fetch and catch block
- `/Users/jim/work/src/github.com/jjenkins/agent-oura/.planning/v1.0-MILESTONE-AUDIT.md` — INT-01, INT-02, INT-03 defect definitions

### Secondary (MEDIUM confidence)
- `/Users/jim/work/src/github.com/jjenkins/agent-oura/.planning/STATE.md` — decisions log confirming allSettled vs all rationale (Phase 2 decision)

## Metadata

**Confidence breakdown:**
- INT-01 removal: HIGH — zero imports confirmed by grep
- INT-02 fix pattern: HIGH — typed codes visible in rejection.reason.message from allSettled
- INT-03 fix pattern: HIGH — ouraGet typed code vs ouraGetWithRetry human string distinction confirmed by reading both functions

**Research date:** 2026-03-22
**Valid until:** Until client.mjs error-classification contract changes (stable)
