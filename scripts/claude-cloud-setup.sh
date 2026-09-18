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
# Node/Yarn versions come from `package.json` (managed by Volta locally); in the
# cloud we rely on whatever runtime the sandbox provides and pass --ignore-engines
# to match CI (.github/actions/install-dependencies).
set -euo pipefail

cd "$(dirname "$0")/.."

# Required by the repo's package-manager setup (some workspaces use pnpm via Volta).
export VOLTA_FEATURE_PNPM=1

echo "node: $(node --version 2>/dev/null || echo 'not found')"
echo "yarn: $(yarn --version 2>/dev/null || echo 'not found')"

echo "Installing dependencies (yarn install --frozen-lockfile)..."
yarn install --ignore-engines --frozen-lockfile

echo "Building packages (yarn build:dev)..."
yarn build:dev

echo "Cloud setup complete."
