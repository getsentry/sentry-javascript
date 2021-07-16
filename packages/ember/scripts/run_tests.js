// running compatibilty tests takes ~15 min on a 2019 2.6 GHz 6-Core Intel i7 16" MacBook Pro w 32 GB of RAM, vs ~25 sec
// for the regular tests

/*eslint-env node*/
const { spawnSync } = require('child_process');

if (process.env.TRAVIS || process.env.GITHUB_ACTIONS) {
  console.log('In CI - running tests against multiple versions of Ember');
  spawnSync('yarn npm-run-all lint:* test:*', { shell: true });
} else {
  console.log('Tests running locally - will only run tests against default version of Ember');
  spawnSync('yarn npm-run-all lint:* test:ember', { shell: true });
}
