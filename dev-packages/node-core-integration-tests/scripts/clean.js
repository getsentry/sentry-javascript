const { execSync } = require('child_process');
const globby = require('globby');
const { dirname, join } = require('path');

const cwd = join(__dirname, '..');
const paths = globby.sync(['suites/**/docker-compose.yml'], { cwd }).map(path => join(cwd, dirname(path)));

// eslint-disable-next-line no-console
console.log('Cleaning up docker containers and volumes...');

for (const path of paths) {
  try {
    // eslint-disable-next-line no-console
    console.log(`docker compose down @ ${path}`);
    execSync('docker compose down --volumes', { stdio: 'inherit', cwd: path });
  } catch {
    //
  }
}
