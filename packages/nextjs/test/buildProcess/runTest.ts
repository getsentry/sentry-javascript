/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as path from 'path';
import { sync as rimrafSync } from 'rimraf';

const TEST_APP_DIR = 'test/buildProcess/testApp';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process if this script is run with the `--debug` flag. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string {
  return String(
    childProcess.execSync(cmd, {
      stdio: process.argv.includes('--debug') ? 'inherit' : 'ignore',
      ...options,
    }),
  );
}

// Note: We use a file dependency for the SDK, rather than linking it, because if it's linked, nextjs rolls the entire
// SDK and all of its dependencies into a bundle, making it impossible to tell (from the NFT file, at least) what's
// being included.
console.log('Installing dependencies...');
process.chdir(TEST_APP_DIR);
rimrafSync('node_modules');
run('yarn');

console.log('Building app...');
rimrafSync('.next');
run('yarn build');

console.log('App built. Running tests...');
process.chdir('..');
const jestConfigFile = path.resolve(process.cwd(), 'jest.config.js');
try {
  // We have to specify the config file explicitly because otherwise it'll use the one at the root level of
  // `packages/nextjs`, since that's where the closest `package.json` file is
  run(`yarn jest --config ${jestConfigFile} tests`, { stdio: 'inherit' });
} catch (err) {
  console.log('\nNot all build process tests passed.');
}
