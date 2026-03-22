# Phase 4: Distribution - Research

**Researched:** 2026-03-22
**Domain:** Claude Code skill distribution, shell-based install scripts, OAuth2 credential configuration, user onboarding documentation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Credential strategy**
- D-01: Each user registers their own Oura developer app at https://cloud.ouraring.com/oauth/applications — no shared/embedded credentials. Overrides Phase 1 D-10/D-11/D-12.
- D-02: Credentials stored in `~/.oura/config.json` as `{ "client_id": "...", "client_secret": "..." }` alongside the existing `~/.oura/tokens.json`
- D-03: Env vars (`OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`) still work as overrides on top of config.json — power users and CI can use env vars without touching config
- D-04: `/oura setup` command guides users through credential configuration — prompts for client_id and client_secret, writes to `~/.oura/config.json`
- D-05: Running `/oura setup` when already configured just overwrites — no confirmation prompt needed
- D-06: `auth.mjs` must be updated to read from `~/.oura/config.json` as the default, with env vars as override. The current `YOUR_CLIENT_ID` placeholder pattern is removed.

**Installation method**
- D-07: One-liner install via `install.sh` at repo root — user runs `curl -sL <raw-url>/install.sh | bash` from their project directory
- D-08: Per-project installation into `.claude/skills/oura/` (not global `~/.claude/skills/`)
- D-09: `install.sh` handles the full end-to-end flow:
  1. Verify Node.js 22+ is available (warn and exit if not)
  2. Clone/copy skill files (SKILL.md + scripts/) into `.claude/skills/oura/`
  3. Run `npm install` in the scripts/ directory
  4. Prompt for client_id and client_secret, write `~/.oura/config.json`

**Setup documentation**
- D-10: Primary documentation in `README.md` at repo root — one-stop shop
- D-11: README includes: what the skill does, prerequisites, install command, Oura app registration walkthrough, first-run auth, usage reference, and troubleshooting
- D-12: Oura developer app registration walkthrough is step-by-step with annotated screenshots (exact steps for each field, redirect URI = `http://localhost:8910/callback`)
- D-13: Usage section covers all commands: `/oura`, `/oura auth`, `/oura profile`, `/oura status`, and natural-language query examples
- D-14: Troubleshooting section covers: Node.js version mismatch, wrong redirect URI, expired tokens, rate limits, missing Oura membership

### Claude's Discretion
- install.sh implementation details (git clone vs curl of individual files)
- README formatting and section ordering
- Whether screenshots are actual images or described placeholders (pending access to Oura developer portal)
- setup.mjs script structure for the `/oura setup` command
- How to detect and report the current Node.js version in install.sh

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | Skill is installable by other Claude Code users via skill-creator pattern | install.sh pattern, Claude Code skill directory conventions, node_modules handling |
| DIST-02 | Setup instructions guide users through OAuth app registration and credential configuration | README walkthrough structure, `~/.oura/config.json` read pattern in auth.mjs, setup.mjs design |
</phase_requirements>

## Summary

Phase 4 is a pure packaging and documentation phase. The runtime skill is complete (Phases 1-3). The work here is: (1) a one-liner `install.sh` that materializes the skill in the user's project directory with all dependencies, (2) a `setup.mjs` script that handles per-user credential configuration via `~/.oura/config.json`, (3) a refactor of `auth.mjs` to read credentials from that config file (removing the `YOUR_CLIENT_ID` placeholder), and (4) a comprehensive `README.md` that makes registration and setup self-service.

The technical complexity is low — these are file-copy, JSON-write, and shell operations. The higher-risk areas are: (a) the `curl | bash` install pattern has well-known security concerns that must be acknowledged in documentation; (b) `~/.oura/config.json` must be created with the same `0600` permissions as `tokens.json` to protect `client_secret`; (c) `node_modules/` cannot be included in git or distributed via curl — `install.sh` must run `npm install` post-copy; (d) the `.envrc` file in the developer's working directory contains live credentials and must be excluded from any distributed artifact.

**Primary recommendation:** Build install.sh using `curl` of individual files (not `git clone`) so users without git can install, then write `setup.mjs` as a minimal interactive credential writer that mirrors the `auth.mjs` pattern for config file handling.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fs/promises` | Node 22+ | Read/write `~/.oura/config.json` in setup.mjs | Same pattern already used in auth.mjs for tokens.json — zero new dependencies |
| Node.js built-in `readline` | Node 22+ | Interactive prompts in setup.mjs for client_id/client_secret | Zero dependency; readline/promises available since Node 17 |
| `open` (sindresorhus) | 11.0.0 (installed) | Already a dependency — used in auth.mjs | No change needed |
| bash | POSIX | install.sh — Node version check, file download, npm install, credential prompt | Universal on macOS/Linux; Claude Code runs on both |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `curl` | system | Download skill files in install.sh | Available on macOS/Linux by default; alternative is `git clone` |
| `npm` | bundled with Node 22+ | Install dependencies after file copy | Required — `node_modules/` is not distributed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `curl` of individual files | `git clone` | `git clone` is simpler to write but requires git. `curl` of individual files requires enumerating files but works in git-free environments. Since the repo is on GitHub, both work — git clone is simpler and preferred if the tradeoff is acceptable. |
| `readline` (Node built-in) | Prompt library (`enquirer`, `prompts`) | External libraries add npm install surface and a pre-install dependency problem. `readline` is the correct choice here. |
| `chmod 0600` on config.json | Relying on umask | umask is not guaranteed to be restrictive. Explicit `chmod` is required for files containing OAuth secrets. |

**Installation (no new dependencies for the skill itself):**
```bash
# install.sh invokes this after copying scripts/
cd .claude/skills/oura/scripts && npm install
```

## Architecture Patterns

### Recommended Project Structure (after Phase 4)
```
<repo-root>/
├── README.md                          # Primary user-facing documentation
├── install.sh                         # One-liner installer
├── .claude/
│   └── skills/
│       └── oura/
│           ├── SKILL.md               # Skill entry point (add /oura setup)
│           └── scripts/
│               ├── auth.mjs           # MODIFIED: reads ~/.oura/config.json
│               ├── setup.mjs          # NEW: credential configuration script
│               ├── client.mjs
│               ├── dashboard.mjs
│               ├── profile.mjs
│               ├── query.mjs
│               └── package.json
~/.oura/
    ├── config.json                    # { client_id, client_secret } — 0600
    └── tokens.json                    # { access_token, refresh_token, expires_at } — 0600
```

### Pattern 1: Config File Read in auth.mjs
**What:** Replace the `YOUR_CLIENT_ID` placeholder constants with a `readConfig()` function that reads `~/.oura/config.json`, with env var override on top.
**When to use:** Every time `CLIENT_ID` or `CLIENT_SECRET` is needed (auth flow, token exchange, token refresh).

```javascript
// Source: mirrors existing auth.mjs token-read pattern (readTokens)
const CONFIG_PATH = join(homedir(), '.oura', 'config.json');

async function readConfig() {
  // Env var override takes precedence (D-03)
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { client_id: clientId, client_secret: clientSecret };
  }

  let raw;
  try {
    raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    throw new Error('NOT_CONFIGURED');  // triggers "run /oura setup" message
  }

  if (!raw.client_id || !raw.client_secret) {
    throw new Error('NOT_CONFIGURED');
  }

  return { client_id: raw.client_id, client_secret: raw.client_secret };
}
```

Key change: `CLIENT_ID` and `CLIENT_SECRET` constants at lines 13-14 of auth.mjs must become an async call to `readConfig()` at the start of any function that needs them (`buildAuthUrl`, `exchangeCode`, `refreshTokens`). Because these functions are called from exported async functions (`initAuth`, `readTokens`), this is straightforward.

### Pattern 2: setup.mjs — Credential Writer
**What:** Interactive script that prompts for `client_id` and `client_secret`, writes `~/.oura/config.json` with 0600 permissions. Invoked by Claude when user runs `/oura setup`.
**When to use:** First-time setup and credential rotation.

```javascript
// Source: mirrors auth.mjs saveTokens pattern
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

await mkdir(CONFIG_DIR, { recursive: true });
const config = { client_id: clientId.trim(), client_secret: clientSecret.trim() };
await writeFile(CONFIG_TMP, JSON.stringify(config, null, 2), 'utf8');
await rename(CONFIG_TMP, CONFIG_PATH);
await chmod(CONFIG_PATH, 0o600);

process.stdout.write('Credentials saved to ~/.oura/config.json\n');
process.stdout.write('Run /oura auth to complete authentication.\n');
```

### Pattern 3: install.sh — One-liner Installer
**What:** Bash script at repo root that a new user pipes to bash. Copies skill files into the current project's `.claude/skills/oura/`, installs npm dependencies, and writes initial config.

**Key implementation choices:**
- Use `git clone --depth=1` if git is available (simpler), else fall back to curl of individual files
- Recommended: git clone into a temp directory, copy the needed subset, then remove the clone
- Node version check: `node --version` then parse major number with shell arithmetic
- Credential prompt is optional in install.sh (D-09 step 4) — user can also run `/oura setup` after install

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Node.js version check ---
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required but not found. Install Node.js 22+ from https://nodejs.org" >&2
  exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node.js 22+ required. Found: $(node --version)" >&2
  echo "Install the latest LTS from https://nodejs.org" >&2
  exit 1
fi

SKILL_DIR=".claude/skills/oura"
REPO="https://github.com/jjenkins/agent-oura"

# --- Clone or download ---
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

git clone --depth=1 "$REPO" "$TMPDIR/repo" 2>/dev/null \
  || { echo "git not available — downloading files individually..."; }

# Copy skill files
mkdir -p "$SKILL_DIR/scripts"
cp "$TMPDIR/repo/.claude/skills/oura/SKILL.md" "$SKILL_DIR/"
cp "$TMPDIR/repo/.claude/skills/oura/scripts/"*.mjs "$SKILL_DIR/scripts/"
cp "$TMPDIR/repo/.claude/skills/oura/scripts/package.json" "$SKILL_DIR/scripts/"

# Install npm deps
(cd "$SKILL_DIR/scripts" && npm install --silent)

echo "Skill installed at $SKILL_DIR"
echo ""
echo "Next step: run /oura setup in Claude Code to configure your Oura credentials."
```

### Anti-Patterns to Avoid

- **Distributing node_modules:** Never include `node_modules/` in the distributed files. `install.sh` runs `npm install` post-copy. The `.gitignore` already excludes `node_modules/`.
- **Committing .envrc:** The developer's `.envrc` file contains live credentials (`OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`). It must never be included in distributed files and should be added to `.gitignore` if not already present. (Currently `.gitignore` only has `node_modules/` — `.envrc` must be added.)
- **Distributing tokens.json or config.json:** These live in `~/.oura/` by design and are never part of the repo.
- **Using `chmod 0600` on the temp file:** Apply permissions after atomic rename, same as `saveTokens` in auth.mjs.
- **Blocking `readConfig()` with synchronous reads:** Keep config read async to match the existing pattern.
- **Making `readConfig()` a module-level top-level await:** Functions that need credentials (`buildAuthUrl`, `exchangeCode`, `refreshTokens`) should call `readConfig()` internally. Top-level awaits complicate module import and error handling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive credential prompt | Custom stdin byte reader | `node:readline/promises` | readline is purpose-built, handles terminal echo, TTY detection |
| Cross-platform browser open | `xdg-open` / `start` shell calls | `open` npm package (already installed) | Already a dependency; handles macOS/Linux/Windows/WSL uniformly |
| Atomic file writes | Custom temp-file logic from scratch | Mirror existing `saveTokens` pattern | Pattern already proven in auth.mjs — reuse it verbatim |
| Node version detection in bash | Complex version parsing | `node --version | cut -d. -f1` after stripping `v` | Simple shell arithmetic; no external tools |

**Key insight:** Every non-trivial pattern in this phase already has a solved implementation in `auth.mjs`. The config file read/write pattern is structurally identical to the token read/write pattern. Copy the pattern, change the path and fields.

## Common Pitfalls

### Pitfall 1: .envrc Leaks Developer Credentials
**What goes wrong:** The developer's `.envrc` contains live `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`. If this file is committed to git or included in distributed files, real credentials leak.
**Why it happens:** `.gitignore` currently only excludes `node_modules/` — `.envrc` is not excluded.
**How to avoid:** Add `.envrc` to `.gitignore` as part of this phase. Document in README that users should NOT use `.envrc` for permanent credential storage — use `~/.oura/config.json` (written by `/oura setup`) instead.
**Warning signs:** `git status` shows `.envrc` as a tracked file.

### Pitfall 2: config.json Missing File Permissions
**What goes wrong:** `~/.oura/config.json` is written without `chmod 0600`, leaving `client_secret` world-readable (default umask varies by OS).
**Why it happens:** Forgetting that umask is not reliable for secret files.
**How to avoid:** Always call `chmod(CONFIG_PATH, 0o600)` after the atomic rename, mirroring `saveTokens`.
**Warning signs:** `ls -la ~/.oura/config.json` shows permissions other than `-rw-------`.

### Pitfall 3: install.sh Fails Silently on npm install Error
**What goes wrong:** `npm install` fails (no internet, wrong Node version for a package) but the script continues. User thinks skill is installed but scripts fail at runtime.
**Why it happens:** Missing error handling in the npm install step.
**How to avoid:** `set -euo pipefail` at the top of `install.sh` (which should already be there). Verify npm install exit code explicitly and print a useful error.

### Pitfall 4: Piping curl to bash Without Set -euo pipefail
**What goes wrong:** `curl -sL url | bash` — if curl fails mid-stream, bash executes a partial script.
**Why it happens:** Network interruption or rate limiting on GitHub raw URL.
**How to avoid:** The install.sh script itself should begin with `set -euo pipefail`. Document in README that users should check the URL before running. A safer alternative to document: download the script first, review it, then run it.
**Warning signs:** Partial installation with some files missing from `.claude/skills/oura/`.

### Pitfall 5: auth.mjs Uses Placeholder Credentials at Import Time
**What goes wrong:** If `CLIENT_ID` and `CLIENT_SECRET` are resolved at module load (top-level), importing `auth.mjs` from other scripts will fail with `NOT_CONFIGURED` if config hasn't been set up — even when those scripts don't need credentials.
**Why it happens:** Module-level constants are resolved on import.
**How to avoid:** Move credential resolution into `readConfig()` and call it lazily inside the functions that need it. Scripts that import `saveTokens` or `readTokens` without needing the OAuth flow won't trigger config reads.

### Pitfall 6: Wrong Redirect URI in Developer App Registration
**What goes wrong:** User registers `http://localhost:8910/callback` with a trailing slash or typo, or registers a different port. Oura returns `redirect_uri_mismatch` error during OAuth.
**Why it happens:** Easy to mistype; Oura requires exact match.
**How to avoid:** README must show the exact string `http://localhost:8910/callback` in a code block (not prose). Troubleshooting section must identify this as the #1 cause of auth failure.

### Pitfall 7: install.sh Clobbers Existing Installation
**What goes wrong:** User re-runs install.sh (e.g., to update) and it overwrites customized files or deletes `node_modules/` before re-installing.
**Why it happens:** Naive `cp -r` or `rm -rf` in the install script.
**How to avoid:** Use `cp -r` without `-f` or check for existing installation and print a notice. The install.sh decisions (D-09) don't specify an update flow — document that re-running install.sh re-installs from scratch.

## Code Examples

Verified patterns from existing codebase:

### Reading config.json (mirrors readTokens pattern in auth.mjs)
```javascript
// Source: auth.mjs readTokens() — adapted for config.json
const CONFIG_DIR = join(homedir(), '.oura');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

async function readConfig() {
  // Env var override (D-03) — power users and CI
  if (process.env.OURA_CLIENT_ID && process.env.OURA_CLIENT_SECRET) {
    return {
      client_id: process.env.OURA_CLIENT_ID,
      client_secret: process.env.OURA_CLIENT_SECRET,
    };
  }

  let raw;
  try {
    raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    throw new Error('NOT_CONFIGURED');
  }

  if (!raw.client_id || !raw.client_secret) {
    throw new Error('NOT_CONFIGURED');
  }

  return { client_id: raw.client_id, client_secret: raw.client_secret };
}
```

### Writing config.json (mirrors saveTokens atomic write pattern in auth.mjs)
```javascript
// Source: auth.mjs saveTokens() — adapted for config.json
const CONFIG_TMP = join(CONFIG_DIR, 'config.json.tmp');

async function saveConfig(clientId, clientSecret) {
  const config = { client_id: clientId, client_secret: clientSecret };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_TMP, JSON.stringify(config, null, 2), 'utf8');
  await rename(CONFIG_TMP, CONFIG_PATH);
  await chmod(CONFIG_PATH, 0o600);
}
```

### Node.js version check in bash
```bash
# Source: standard shell pattern
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node.js 22+ required. Found: $(node --version 2>/dev/null || echo 'not installed')" >&2
  exit 1
fi
```

### SKILL.md addition for /oura setup
```markdown
### /oura setup

Configure your Oura API credentials (required before first use):

\`\`\`bash
cd {project_root}/.claude/skills/oura/scripts && node setup.mjs
\`\`\`

This prompts for your Oura `client_id` and `client_secret` and stores them in `~/.oura/config.json`.
You only need to run this once. To get credentials:
1. Visit https://cloud.ouraring.com/oauth/applications
2. Register a new application with redirect URI: `http://localhost:8910/callback`
3. Copy the client_id and client_secret shown after registration

After setup, run `/oura auth` to complete OAuth2 authentication.
```

### Error message for NOT_CONFIGURED in auth.mjs CLI entry point
```javascript
// Source: auth.mjs showStatus() pattern — adapt for NOT_CONFIGURED
if (err.message === 'NOT_CONFIGURED') {
  process.stdout.write(JSON.stringify({
    authenticated: false,
    reason: 'Credentials not configured. Run /oura setup to add your Oura client_id and client_secret.',
  }));
  return;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `YOUR_CLIENT_ID` placeholder in auth.mjs | `~/.oura/config.json` read via `readConfig()` | Phase 4 (this phase) | Single-developer credential style replaced with per-user config; enables distribution |
| No SKILL.md entry for setup | `/oura setup` command in SKILL.md | Phase 4 (this phase) | Users can configure credentials from within Claude Code conversation |
| No install story | `install.sh` one-liner | Phase 4 (this phase) | Cold-start time for new users goes from manual file copy to one command |

**Deprecated/outdated:**
- `YOUR_CLIENT_ID` / `YOUR_CLIENT_SECRET` placeholder constants (lines 13-14 of auth.mjs): Remove entirely. Replace with `readConfig()` call pattern. Do not leave placeholder pattern as a fallback.
- SKILL.md note "Requires `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` environment variables, or that the placeholder values in `auth.mjs` have been replaced": Remove after Phase 4. Replace with reference to `/oura setup`.

## Open Questions

1. **install.sh file enumeration — git clone vs individual curl**
   - What we know: git clone is simpler but requires git. curl of individual files requires an explicit file list but works everywhere.
   - What's unclear: The GitHub raw URL pattern for individual files vs. the `git clone` path. If the repo is private at install time, curl requires authentication.
   - Recommendation: Use `git clone --depth=1` as primary method since all Claude Code users are developers who have git. Document as a prerequisite. Add a comment in install.sh noting where to find the raw URL alternative.

2. **Screenshots vs. placeholder descriptions in README**
   - What we know: CONTEXT.md D-12 specifies "annotated screenshots" for the Oura developer app registration walkthrough. The developer portal UI is at https://cloud.ouraring.com/oauth/applications.
   - What's unclear: Whether to include actual image files in the repo or use descriptive text with field labels.
   - Recommendation: Use ASCII/text descriptions with exact field values in code blocks for the initial version. This is maintainable and doesn't require binary assets in git. Images can be added later if the developer portal UI changes infrequently.

3. **`.envrc` in .gitignore**
   - What we know: `.envrc` currently contains live credentials and is not in `.gitignore`. The current `.gitignore` only has `node_modules/`.
   - What's unclear: Whether the developer intends to keep `.envrc` for local dev after Phase 4.
   - Recommendation: Add `.envrc` to `.gitignore` as part of Phase 4. Document in README that local developers can still use `.envrc` with `direnv` for their own credential override — it just shouldn't be committed.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `.claude/skills/oura/scripts/auth.mjs` — verified patterns for atomic file writes, env var override, token directory, chmod 0600 (read directly, 2026-03-22)
- Existing codebase: `.claude/skills/oura/scripts/package.json` + `package-lock.json` — confirmed `open@11.0.0` is the installed version (read directly, 2026-03-22)
- Existing codebase: `.claude/skills/oura/SKILL.md` — confirmed command structure, `{project_root}` pattern, all existing commands (read directly, 2026-03-22)
- Node.js official docs: `node:readline/promises` available since Node 17, stable in Node 22 (HIGH — part of Node standard library)

### Secondary (MEDIUM confidence)
- CONTEXT.md Phase 4 decisions (D-01 through D-14) — locked implementation choices (read directly, 2026-03-22)
- CLAUDE.md project conventions — stack choices, ESM .mjs pattern, ~/.oura/ directory (read directly, 2026-03-22)

### Tertiary (LOW confidence)
- None — all findings grounded in codebase inspection or Node.js standard library

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are existing dependencies or Node.js built-ins verified in the codebase
- Architecture: HIGH — patterns are directly derived from existing auth.mjs implementation
- Pitfalls: HIGH for credential security pitfalls (verified by codebase inspection); MEDIUM for install.sh edge cases (standard bash patterns)

**Research date:** 2026-03-22
**Valid until:** 2026-06-22 (stable domain — Node.js, OAuth2 patterns, bash shell scripting)
