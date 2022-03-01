const { spawnSync } = require('child_process');
const { join } = require('path');

const nodeVersion = parseInt(process.version.split('.')[0].replace('v', ''), 10);

function run(cmd) {
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: join(__dirname, '..') });

  if (result.status !== 0) {
    process.exit(result.status);
  }
}

// control which packages we test on each version of node
if (nodeVersion <= 6) {
  // install legacy versions of packages whose current versions don't support node 6
  // ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  run('cd packages/node && yarn add --dev --ignore-engines --ignore-scripts nock@10.x');
  run('cd packages/tracing && yarn add --dev --ignore-engines --ignore-scripts jsdom@11.x');
  run('cd packages/utils && yarn add --dev --ignore-engines --ignore-scripts jsdom@11.x');

  // only test against @sentry/node and its dependencies - node 6 is too old for anything else to work
  run(
    'yarn test --scope="@sentry/core" --scope="@sentry/hub" --scope="@sentry/minimal" --scope="@sentry/node" --scope="@sentry/utils" --scope="@sentry/tracing"'
  );
} else if (nodeVersion <= 8) {
  // install legacy versions of packages whose current versions don't support node 8
  // ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  run('cd packages/tracing && yarn add --dev --ignore-engines --ignore-scripts jsdom@15.x');
  run('cd packages/utils && yarn add --dev --ignore-engines --ignore-scripts jsdom@15.x');

  // ember tests happen separately, and the rest fail on node 8 for various syntax or dependency reasons
  run(
    'yarn test --ignore="@sentry/ember" --ignore="@sentry-internal/eslint-plugin-sdk" --ignore="@sentry/react" --ignore="@sentry/wasm" --ignore="@sentry/gatsby" --ignore="@sentry/serverless" --ignore="@sentry/nextjs"'
  );
} else {
  if (process.platform === 'win32') {
    run('yarn test --ignore="@sentry/ember" --ignore="@sentry/nextjs"');
  } else {
    run('yarn test --ignore="@sentry/ember"');
  }
}

process.exit(0);
