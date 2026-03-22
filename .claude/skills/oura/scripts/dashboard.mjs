// Daily health dashboard — fetches readiness, sleep, activity, and stress in parallel.
// Outputs structured plaintext to stdout for Claude to interpret and present to the user.
// Uses ouraGet directly (not ouraGetWithRetry) to preserve typed error codes for per-section
// sync-state classification. DATA_NOT_SYNCED collapses a section; hard errors also collapse it.

import { ouraGet } from './client.mjs';

try {
  // Derive today's date in the user's local timezone (en-CA locale produces YYYY-MM-DD).
  // Do NOT use toISOString() — that returns UTC and causes off-by-one errors for users
  // west of UTC (e.g., a user in UTC-8 at 11pm UTC would query tomorrow's date).
  const today = new Date().toLocaleDateString('en-CA');

  // Fetch all four daily endpoints in parallel. Promise.allSettled is required over
  // Promise.all so that one unsynced section doesn't abort the others (D-09).
  const [readinessResult, sleepResult, activityResult, stressResult] = await Promise.allSettled([
    ouraGet('/usercollection/daily_readiness', { start_date: today, end_date: today }),
    ouraGet('/usercollection/daily_sleep',     { start_date: today, end_date: today }),
    ouraGet('/usercollection/daily_activity',  { start_date: today, end_date: today }),
    ouraGet('/usercollection/daily_stress',    { start_date: today, end_date: today }),
  ]);

  // Extract the first data record from a settled promise result.
  // Returns null if the promise rejected (any error including DATA_NOT_SYNCED)
  // or if the response has no data array or an empty one.
  function extractRecord(result) {
    if (result.status === 'rejected') return null;
    const data = result.value?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0];
  }

  const readiness = extractRecord(readinessResult);
  const sleep     = extractRecord(sleepResult);
  const activity  = extractRecord(activityResult);
  const stress    = extractRecord(stressResult);

  // INT-02: Detect auth errors before the all-null guard.
  // Auth failures (401/403/no-token) cause all four ouraGet calls to reject.
  // Without this check, auth errors are indistinguishable from sync delays.
  const AUTH_ERRORS = ['AUTH_EXPIRED', 'AUTH_FORBIDDEN', 'NOT_AUTHENTICATED', 'REFRESH_FAILED'];
  const authError = [readinessResult, sleepResult, activityResult, stressResult]
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.message)
    .find(msg => AUTH_ERRORS.includes(msg));

  if (authError) {
    if (authError === 'AUTH_EXPIRED' || authError === 'REFRESH_FAILED') {
      process.stderr.write('Authentication expired. Run /oura auth to re-authenticate.\n');
    } else if (authError === 'AUTH_FORBIDDEN') {
      process.stderr.write('Access denied. Run /oura auth to re-authenticate with all required scopes.\n');
    } else {
      process.stderr.write('Not authenticated. Run /oura auth to connect your Oura account.\n');
    }
    process.exit(1);
  }

  // D-11: if nothing has synced at all, show a single notice and exit cleanly.
  if (!readiness && !sleep && !activity && !stress) {
    process.stdout.write("Today's data hasn't synced yet. Check your Oura app.\n");
    process.exit(0);
  }

  // Sort contributors ascending by value so the worst (lowest) appear first (D-06).
  // Filters out null/undefined values to avoid misleading "null" lines in output.
  function sortedContributors(contributors) {
    if (!contributors) return [];
    return Object.entries(contributors)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([, a], [, b]) => a - b); // ascending: lowest (worst) first
  }

  const lines = [
    '=== Daily Health Dashboard ===',
    `Date: ${today}`,
    '',
  ];

  // --- Readiness section (D-01, D-02, D-03, D-05) ---
  // Show score + all contributors sorted worst-first + temperature deviation if present.
  if (readiness) {
    lines.push(`--- Readiness: ${readiness.score ?? 'pending'} ---`);
    for (const [key, val] of sortedContributors(readiness.contributors)) {
      lines.push(`  ${key}: ${val}`);
    }
    if (readiness.temperature_deviation !== null && readiness.temperature_deviation !== undefined) {
      lines.push(`  temperature_deviation: ${readiness.temperature_deviation} C`);
    }
    lines.push('');
  }

  // --- Sleep section (D-01, D-02, D-03, D-05) ---
  // Show score + all contributors sorted worst-first.
  if (sleep) {
    lines.push(`--- Sleep: ${sleep.score ?? 'pending'} ---`);
    for (const [key, val] of sortedContributors(sleep.contributors)) {
      lines.push(`  ${key}: ${val}`);
    }
    lines.push('');
  }

  // --- Activity section (D-01, D-02, D-03, D-08) ---
  // Show score + key metrics only. Contributors are omitted silently per D-08.
  if (activity) {
    lines.push(`--- Activity: ${activity.score ?? 'pending'} ---`);
    lines.push(`  active_calories: ${activity.active_calories}`);
    lines.push(`  steps: ${activity.steps}`);
    if (activity.equivalent_walking_distance !== null && activity.equivalent_walking_distance !== undefined) {
      lines.push(`  equivalent_walking_distance: ${activity.equivalent_walking_distance} m`);
    }
    lines.push('');
  }

  // --- Stress section (D-01, D-02, D-04, D-08) ---
  // Stress has no numeric score — use day_summary as the section summary value (Pitfall 3).
  // Show stress_high and recovery_high (in seconds) when not null.
  if (stress) {
    lines.push(`--- Stress: ${stress.day_summary ?? 'pending'} ---`);
    if (stress.stress_high !== null && stress.stress_high !== undefined) {
      lines.push(`  stress_high: ${stress.stress_high}s`);
    }
    if (stress.recovery_high !== null && stress.recovery_high !== undefined) {
      lines.push(`  recovery_high: ${stress.recovery_high}s`);
    }
    lines.push('');
  }

  // Remove trailing blank line if present
  if (lines[lines.length - 1] === '') lines.pop();

  process.stdout.write(lines.join('\n') + '\n');

} catch (err) {
  // Unexpected error — not a per-section sync issue, but a hard failure (e.g., auth not set up).
  process.stderr.write(`dashboard error: ${err.message}\n`);
  process.exit(1);
}
