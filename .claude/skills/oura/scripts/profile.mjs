// Oura profile script — fetches personal info and ring configuration.
// Outputs formatted plaintext to stdout for Claude to read and present.

import { ouraGet, ouraGetWithRetry } from './client.mjs';

try {
  // Fetch both endpoints in parallel — personal_info is required; ring_configuration
  // may return empty data[] if no ring is paired (DATA_NOT_SYNCED typed error).
  const [personalInfo, ringConfigRaw] = await Promise.all([
    ouraGetWithRetry('/usercollection/personal_info'),
    ouraGet('/usercollection/ring_configuration').catch(err => {
      if (err.message === 'DATA_NOT_SYNCED') return { data: [] };
      throw err; // re-throw auth/rate errors so they propagate to outer catch
    }),
  ]);

  // personal_info is a direct object (no data: [] wrapper).
  // ring_configuration returns { data: [...] } — sort by set_up_at and take most recent.
  const ring = (ringConfigRaw.data && ringConfigRaw.data.length > 0)
    ? ringConfigRaw.data.sort((a, b) => new Date(a.set_up_at) - new Date(b.set_up_at)).at(-1)
    : null;

  const lines = ['=== Oura Profile ===', ''];

  lines.push('Personal Info:');
  if (personalInfo.email != null)         lines.push(`  Email: ${personalInfo.email}`);
  if (personalInfo.age != null)           lines.push(`  Age: ${personalInfo.age}`);
  if (personalInfo.height != null)        lines.push(`  Height: ${personalInfo.height} cm`);
  if (personalInfo.weight != null)        lines.push(`  Weight: ${personalInfo.weight} kg`);
  if (personalInfo.biological_sex != null) lines.push(`  Biological sex: ${personalInfo.biological_sex}`);

  if (ring) {
    lines.push('', 'Ring Configuration:');
    lines.push(`  Hardware: ${ring.hardware_type}`);
    lines.push(`  Color: ${ring.color}`);
    lines.push(`  Design: ${ring.design}`);
    lines.push(`  Firmware: ${ring.firmware_version}`);
    lines.push(`  Size: ${ring.size}`);
    if (ring.set_up_at) lines.push(`  Setup date: ${ring.set_up_at.split('T')[0]}`);
  } else {
    lines.push('', 'Ring Configuration:');
    lines.push('  No ring paired. Open the Oura app to pair your ring.');
  }

  process.stdout.write(lines.join('\n') + '\n');
} catch (err) {
  process.stderr.write(err.message + '\n');
  process.exit(1);
}
