#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/jjenkins/agent-oura"
SKILL_DIR=".claude/skills/oura"

echo "=== Agent Oura Installer ==="
echo ""

# --- Node.js version check ---
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required but not found." >&2
  echo "Install Node.js 22+ from https://nodejs.org" >&2
  exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node.js 22+ required. Found: $(node --version)" >&2
  echo "Install the latest LTS from https://nodejs.org" >&2
  exit 1
fi

echo "Node.js $(node --version) detected"

# --- Clone repo to temp directory ---
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading skill files..."

if command -v git &>/dev/null; then
  git clone --depth=1 --quiet "$REPO" "$TMPDIR/repo"
else
  echo "ERROR: git is required but not found." >&2
  echo "Install git from https://git-scm.com or via your package manager." >&2
  exit 1
fi

# --- Copy skill files into project (per-project install) ---
echo "Installing to $SKILL_DIR/"
mkdir -p "$SKILL_DIR/scripts"

cp "$TMPDIR/repo/.claude/skills/oura/SKILL.md" "$SKILL_DIR/"
cp "$TMPDIR/repo/.claude/skills/oura/scripts/"*.mjs "$SKILL_DIR/scripts/"
cp "$TMPDIR/repo/.claude/skills/oura/scripts/package.json" "$SKILL_DIR/scripts/"
cp "$TMPDIR/repo/.claude/skills/oura/scripts/package-lock.json" "$SKILL_DIR/scripts/" 2>/dev/null || true

# --- Install npm dependencies ---
echo "Installing dependencies..."
(cd "$SKILL_DIR/scripts" && npm install --silent --no-fund --no-audit)

echo ""
echo "Skill installed successfully at $SKILL_DIR/"
echo ""
echo "Next steps:"
echo "  1. Register an Oura developer app at https://cloud.ouraring.com/oauth/applications"
echo "     - Set redirect URI to: http://localhost:8910/callback"
echo "  2. In Claude Code, run: /oura setup"
echo "     - Paste your client_id and client_secret when prompted"
echo "  3. Run: /oura auth"
echo "     - Complete the OAuth2 flow in your browser"
echo "  4. Run: /oura"
echo "     - See your daily health dashboard!"
