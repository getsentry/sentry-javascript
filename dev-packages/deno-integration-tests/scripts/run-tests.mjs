// `yarn test` runs the Deno-only suites (`deno test`) and then the shared Node suites (vitest),
// like the other integration test packages.
//
// `yarn test <filter>` runs only the shared Node suites with that filter, e.g. `yarn test express`,
// because `deno test` does not take vitest filters. To filter the Deno-only suites by test name,
// run `yarn test:unit --filter <name>`.
import { spawnSync } from 'node:child_process';

const filters = process.argv.slice(2);

function run(script, args = []) {
  const result = spawnSync('yarn', ['--silent', script, ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (filters.length === 0) {
  run('install:deno');
  run('deno-types');
  run('test:unit');
}

run('test:node-suites', filters);
