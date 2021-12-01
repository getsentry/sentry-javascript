/*eslint-env node*/
const { spawnSync } = require('child_process');

console.log('Mimicking the CI environment in order to run tests against multiple versions of Ember');

const result = spawnSync('yarn test', {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    GITHUB_ACTIONS: true,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_HEAD_REF: 'master',
  },
});

process.exit(result.status);
