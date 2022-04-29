import { spawnSync } from 'child_process';
import { join } from 'path';

function run(cmd: string, cwd: string = '') {
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: join(__dirname, '..', cwd || '') });

  if (result.status !== 0) {
    process.exit(result.status || undefined);
  }
}

const nodeMajorVersion = parseInt(process.version.split('.')[0].replace('v', ''), 10);

// Ember tests require dependency changes for each set of tests, making them quite slow. To compensate for this, in CI
// we run them in a separate, parallel job.
let ignorePackages = ['@sentry/ember'];

// install legacy versions of third-party packages whose current versions don't support node 8 or 10, and skip testing
// our own packages which don't support node 8 for various syntax or dependency reasons
if (nodeMajorVersion <= 10) {
  let legacyDependencies;

  if (nodeMajorVersion === 8) {
    legacyDependencies = [
      'jsdom@15.x',
      'jest@25.x',
      'jest-environment-jsdom@25.x',
      'jest-environment-node@25.x',
      'ts-jest@25.x',
    ];

    ignorePackages = [
      ...ignorePackages,
      '@sentry-internal/eslint-plugin-sdk',
      '@sentry/react',
      '@sentry/wasm',
      '@sentry/gatsby',
      '@sentry/serverless',
      '@sentry/nextjs',
      '@sentry/angular',
    ];

    // This is a hack, to deal the fact that the browser-based tests fail under Node 8, because of a conflict buried
    // somewhere in the interaction between our current overall set of dependencies and the older versions of a small
    // subset we're about to install below. Since they're browser-based, these tests are never going to be running in a
    // node 8 environment in any case, so it's fine to skip them here. (In the long run, we should only run such tests
    // against a single version of node, but in the short run, this at least allows us to not be blocked by the
    // failures.)
    run('rm -rf packages/tracing/test/browser');
  }
  // Node 10
  else {
    legacyDependencies = ['jsdom@16.x'];
  }

  const legacyDepStr = legacyDependencies.join(' ');

  // ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  run(`yarn add --dev --ignore-engines --ignore-scripts --ignore-workspace-root-check ${legacyDepStr}`);
}

const ignoreFlags = ignorePackages.map(dep => `--ignore="${dep}"`).join(' ');

run(`yarn test ${ignoreFlags}`);

process.exit(0);
