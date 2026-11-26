import { createHash } from 'node:crypto';
import fs from 'node:fs';

const workspaces = JSON.parse(fs.readFileSync('package.json', 'utf8')).workspaces;
const sdk = workspaces.filter(directory => directory.startsWith('packages/'));
const serverTests = [
  'dev-packages/node-integration-tests',
  'dev-packages/bun-integration-tests',
  'dev-packages/deno-integration-tests',
  'dev-packages/bundler-plugin-integration-tests',
];
const browserTests = ['dev-packages/browser-integration-tests', 'dev-packages/browser-min-version-tests'];
const groups = {
  sdk: [...sdk, 'dev-packages/test-utils', 'dev-packages/bundler-tests'],
  server: [...sdk, 'dev-packages/test-utils', ...serverTests],
  browser: [...browserTests, 'packages/browser'],
  cloudflare: ['dev-packages/cloudflare-integration-tests'],
};

const [command, value, dependencyHash] = process.argv.slice(2);
if (command === 'select') {
  const paths = value.split(',');
  let group = '';
  if (paths.every(directory => browserTests.includes(directory) || directory === 'packages/browser')) {
    group = 'browser';
  } else if (paths.every(directory => serverTests.includes(directory))) {
    group = 'server';
  } else if (paths.every(directory => groups.cloudflare.includes(directory))) {
    group = 'cloudflare';
  } else if (
    paths.every(
      directory =>
        directory.startsWith('packages/') || directory.startsWith('dev-packages/e2e-tests/test-applications/'),
    )
  ) {
    group = 'sdk';
  }
  process.stdout.write(`group=${group}\n`);
} else {
  const paths = groups[value];
  if (!paths) throw new Error(`Unknown dependency group: ${value}`);
  if (command === 'roots') {
    process.stdout.write(`paths=${paths.join(',')}\n`);
  } else if (command === 'key') {
    if (!dependencyHash) throw new Error('Missing dependency hash');
    // Changing a group's membership must invalidate its installation too.
    const membership = createHash('sha256').update(JSON.stringify(paths)).digest('hex').slice(0, 12);
    process.stdout.write(
      `key=dependencies-selected-v1-${value}-${membership}-${dependencyHash}-${process.env.RUNNER_OS}-${process.env.RUNNER_ARCH}\n`,
    );
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}
