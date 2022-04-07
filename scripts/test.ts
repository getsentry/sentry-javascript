import { spawnSync } from 'child_process';
import { join } from 'path';

function run(cmd: string, cwd: string = '') {
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: join(__dirname, '..', cwd || '') });

  if (result.status !== 0) {
    process.exit(result.status || undefined);
  }
}

const nodeMajorVersion = parseInt(process.version.split('.')[0].replace('v', ''), 10);

if (nodeMajorVersion <= 8) {
  // install legacy versions of packages whose current versions don't support node 8
  // ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  run('yarn add --dev --ignore-engines --ignore-scripts jsdom@15.x', 'packages/tracing');
  run('yarn add --dev --ignore-engines --ignore-scripts jsdom@15.x', 'packages/utils');

  // ember tests happen separately, and the rest fail on node 8 for various syntax or dependency reasons
  const ignore = [
    '@sentry/ember',
    '@sentry-internal/eslint-plugin-sdk',
    '@sentry/react',
    '@sentry/wasm',
    '@sentry/gatsby',
    '@sentry/serverless',
    '@sentry/nextjs',
  ]
    .map(dep => `--ignore="${dep}"`)
    .join(' ');

  run(`yarn test ${ignore}`);
} else {
  run('yarn test --ignore="@sentry/ember"');
}

process.exit(0);
