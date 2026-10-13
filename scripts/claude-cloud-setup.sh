#!/usr/bin/env bash
#
# Bootstrap the Sentry JavaScript monorepo for a Claude Code cloud session.
#
# Wired as the repo's SessionStart hook (see .claude/settings.json), gated to
# cloud sessions. It runs on every session so the checkout is always installed
# and built against the *current* branch -- the code changes constantly, so a
# build cached at environment-creation time would be stale. Repeated runs are
# cheap: a frozen-lockfile install is a no-op when node_modules is warm, and Nx
# only rebuilds packages whose inputs actually changed.
#
# Node/pnpm versions come from `package.json` (managed by Volta locally); in the
# cloud we rely on whatever Node runtime the sandbox provides, and install the
# pinned pnpm version when the sandbox has none.
set -euo pipefail

cd "$(dirname "$0")/.."

# Required by the repo's package-manager setup (pnpm via Volta).
export VOLTA_FEATURE_PNPM=1

echo "node: $(node --version 2>/dev/null || echo 'not found')"

if ! command -v pnpm >/dev/null 2>&1; then
  PNPM_VERSION="$(node -p "require('./package.json').volta.pnpm")"
  echo "Installing pnpm ${PNPM_VERSION}..."
  npm install --global "pnpm@${PNPM_VERSION}"
fi
echo "pnpm: $(pnpm --version)"

echo "Installing dependencies (pnpm install --frozen-lockfile)..."
pnpm install --frozen-lockfile

echo "Building packages (pnpm build:dev)..."
pnpm build:dev

echo "Cloud setup complete."
