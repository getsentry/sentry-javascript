const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const TYPESCRIPT_VERSION = '~7.0.2';

if (pkg.devDependencies.typescript !== TYPESCRIPT_VERSION) {
  console.error(`
[INCORRECT PACKAGE VERSION]: Expected TypeScript v${TYPESCRIPT_VERSION}, got v${pkg.devDependencies.typescript}

Starting version 3.9, TypeScript emits module exports using \`Object.defineProperty\`,
with \`configurable: false\`, instead of \`exports.thing = module.thing;\` as it always used to do.
This means, that any object mutation after the initial compilation are impossible and makes
the package slightly less open for modifications, and prevent users from experimenting with it,
and from implementing some of their scenarios.

If you REALLY know what you are doing, and you REALLY want to use a different version of TypeScript,
modify \`TYPESCRIPT_VERSION\` constant at the top of this file (\`scripts/verify-packages-versions.js\`).

change: https://github.com/getsentry/sentry-javascript/pull/2848
ref: https://github.com/getsentry/sentry-javascript/issues/2845
ref: https://twitter.com/wesleytodd/status/1297974661574262784

"Never upgrade a TypeScript version without a major package bump. Just don't." — Kamil
`);
  process.exit(1);
}

// pnpm reads the workspace packages from `pnpm-workspace.yaml`, the repo scripts and Deno from `package.json`.
function readPnpmWorkspacePackages() {
  const lines = fs.readFileSync(path.join(__dirname, '../pnpm-workspace.yaml'), 'utf8').split('\n');
  const start = lines.indexOf('packages:');
  const packages = [];

  if (start === -1) {
    return packages;
  }

  for (const line of lines.slice(start + 1)) {
    // The list ends at the next top-level key.
    if (/^[^\s#]/.test(line)) {
      break;
    }

    const match = line.match(/^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/);
    if (match) {
      packages.push(match[1]);
    }
  }

  return packages;
}

if (readPnpmWorkspacePackages().join('\n') !== pkg.workspaces.join('\n')) {
  console.error(`
[INCONSISTENT WORKSPACES]: The \`packages\` list in pnpm-workspace.yaml and the \`workspaces\` list in package.json
must contain the same packages in the same order.
`);
  process.exit(1);
}

process.exit(0);
