// Oura credential setup script.
// Prompts for client_id and client_secret and writes ~/.oura/config.json with 0600 permissions.

import { createInterface } from 'node:readline/promises';
import { writeFile, rename, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.oura');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const CONFIG_TMP = join(CONFIG_DIR, 'config.json.tmp');

const rl = createInterface({ input: process.stdin, output: process.stdout });

const clientId = await rl.question('Oura client_id: ');
const clientSecret = await rl.question('Oura client_secret: ');
rl.close();

if (!clientId.trim() || !clientSecret.trim()) {
  process.stderr.write('Error: Both client_id and client_secret are required.\n');
  process.exit(1);
}

await mkdir(CONFIG_DIR, { recursive: true });
const config = { client_id: clientId.trim(), client_secret: clientSecret.trim() };
await writeFile(CONFIG_TMP, JSON.stringify(config, null, 2), 'utf8');
await rename(CONFIG_TMP, CONFIG_PATH);
await chmod(CONFIG_PATH, 0o600);

process.stdout.write('Credentials saved to ~/.oura/config.json\n');
process.stdout.write('Run /oura auth to complete authentication.\n');
