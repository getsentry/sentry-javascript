#!/bin/bash
set -eux

# Move to the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd $SCRIPT_DIR/..
OLD_VERSION="${1}"
NEW_VERSION="${2}"

yarn install --frozen-lockfile
# Bump version in all workspace packages (exact versions, no git tags or commits)
node scripts/bump-version.js "${NEW_VERSION}"

# Update E2E lockfiles so they reference the new packed tarballs
yarn build:ci
yarn build:tarball
cd dev-packages/e2e-tests && yarn test:prepare && cd ../..
pnpm install --lockfile-only --dir dev-packages/e2e-tests
