---
phase: 04-distribution
plan: 02
subsystem: distribution
tags: [install, documentation, readme, bash, one-liner]
dependency_graph:
  requires: [04-01]
  provides: [installer-script, user-documentation]
  affects: [install.sh, README.md]
tech_stack:
  added: []
  patterns: [bash-installer, git-clone-depth-1, trap-cleanup]
key_files:
  created:
    - install.sh
    - README.md
  modified: []
decisions:
  - install.sh uses git clone --depth=1 as primary download method — simpler than curl-per-file enumeration; all Claude Code users have git
  - install.sh requires git and errors clearly if absent rather than implementing curl fallback — simpler and more maintainable
  - README documents both curl|bash and download-and-review install methods — gives security-conscious users a review path
metrics:
  duration: ~3min
  completed: "2026-03-22T16:25:00Z"
  tasks_completed: 3
  files_modified: 2
---

# Phase 4 Plan 2: Installer and Documentation Summary

One-command install script and comprehensive user documentation enabling any Claude Code user to install and configure the Agent Oura skill from scratch.

## Tasks Completed

### Task 1: Create install.sh one-liner installer

**Commit:** c19eab3

**Files:**
- `install.sh` (created, executable)

**Changes:**

Created `install.sh` at the repo root as a pipe-to-bash one-liner installer:
- `set -euo pipefail` for fail-fast behavior
- Checks for Node.js presence and validates major version >= 22
- Creates temp directory with `mktemp -d` and registers `trap 'rm -rf "$TMPDIR"' EXIT` for cleanup
- Checks for git and errors clearly if absent
- Clones repo with `git clone --depth=1 --quiet` to temp directory
- Creates `$SKILL_DIR/scripts` directory structure
- Copies `SKILL.md`, all `.mjs` scripts, `package.json`, and `package-lock.json` (with `|| true` for the lock file)
- Runs `npm install --silent --no-fund --no-audit` in the scripts directory
- Prints numbered next steps: register app, `/oura setup`, `/oura auth`, `/oura`

### Task 2: Create comprehensive README.md

**Commit:** 57402f1

**Files:**
- `README.md` (created, 197 lines)

**Changes:**

Created `README.md` at the repo root covering the complete user journey:
- What It Does section with feature bullets
- Prerequisites: Node.js 22+, Oura Ring, developer app
- Installation section with `curl -sL ... | bash` one-liner and download-and-review alternative
- Setting Up Your Oura Developer App: 6-step walkthrough with exact redirect URI (`http://localhost:8910/callback`)
- Configuration: `/oura setup` and `/oura auth` with credential storage paths
- Usage: all 5 commands (`/oura`, `/oura setup`, `/oura auth`, `/oura status`, `/oura profile`) plus natural language query examples
- Troubleshooting: 7 issues covered (Node.js version, redirect_uri_mismatch, credentials not configured, token expired, rate limit, membership required, port 8910 in use)
- Environment Variables table: `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`
- How It Works architecture overview
- MIT License

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| git clone --depth=1 as primary installer method | All Claude Code users have git; simpler than curl-per-file; depth=1 avoids full history |
| Error on git absence rather than curl fallback | Simpler script; curl fallback requires maintaining a file list that drifts with code changes |
| Both curl pipe and download-and-review install documented | Security-conscious users can review the script before running it |

## Verification Results

All acceptance criteria met:

- install.sh exists at repo root and is executable (`test -x install.sh`)
- install.sh passes bash syntax check (`bash -n install.sh`)
- install.sh contains `set -euo pipefail`
- install.sh contains Node.js version check comparing major version to 22
- install.sh contains `git clone --depth=1`
- install.sh contains `mkdir -p "$SKILL_DIR/scripts"`
- install.sh copies SKILL.md and all .mjs files and package.json
- install.sh contains `npm install` in the scripts directory
- install.sh contains `trap` for cleanup of temp directory
- install.sh prints next steps including `/oura setup` and `/oura auth`
- README.md exists at repo root
- README.md title is "Agent Oura"
- README.md contains install.sh curl one-liner with raw.githubusercontent.com URL
- README.md contains "download and review" alternative install method
- README.md contains Oura developer app registration steps with `http://localhost:8910/callback`
- README.md documents all commands: `/oura setup`, `/oura auth`, `/oura status`, `/oura`, `/oura profile`
- README.md contains natural language query examples
- README.md troubleshooting covers all 7 required issues
- README.md contains environment variables table with OURA_CLIENT_ID and OURA_CLIENT_SECRET
- README.md is 197 lines (well above 100-line minimum)

### Task 3: Human verification checkpoint

**Commit:** 9d6f29f

User reviewed the distribution package and requested additions to the Oura developer app registration section:
- Added Website URL field with localhost guidance
- Added Privacy Policy URL field with localhost guidance
- Added Terms of Service URL field with localhost guidance

User approved the checkpoint after all three URL fields were documented.

## Deviations from Plan

- Added Website URL, Privacy Policy URL, and Terms of Service URL fields to Oura developer app registration steps (user feedback during checkpoint — these are required form fields not in the original plan)

## Known Stubs

None.

## Self-Check: PASSED
