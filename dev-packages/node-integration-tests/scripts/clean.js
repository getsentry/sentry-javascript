const { execSync } = require('child_process');
const { createHash } = require('crypto');
const globby = require('globby');
const { dirname, join } = require('path');

const cwd = join(__dirname, '..');
const paths = globby.sync(['suites/**/docker-compose.yml'], { cwd }).map(path => join(cwd, dirname(path)));

// Must stay in sync with `runDockerCompose` in utils/runner/createRunner.ts:
// the runner starts each suite under a unique, path-derived project name, so we
// have to target the same name here or the teardown misses the containers.
const projectNameFor = suiteDir => `sentry-it-${createHash('sha1').update(suiteDir).digest('hex').slice(0, 12)}`;

// eslint-disable-next-line no-console
console.log('Cleaning up docker containers and volumes...');

for (const path of paths) {
  try {
    // eslint-disable-next-line no-console
    console.log(`docker compose down @ ${path}`);
    execSync(`docker compose -p ${projectNameFor(path)} down --volumes`, { stdio: 'inherit', cwd: path });
  } catch {
    //
  }
}
