import * as childProcess from 'child_process';
import * as fs from 'fs';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string | Buffer {
  return childProcess.execSync(cmd, { stdio: 'inherit', ...options });
}

run('yarn rollup -c rollup.npm.config.mjs');

// We want to distribute the README because it contains the MIT license blurb from Sucrase and Rollup
fs.copyFileSync('src/buildPolyfills/README.md', 'build/cjs/build-polyfills-license.md');
fs.copyFileSync('src/buildPolyfills/README.md', 'build/esm/build-polyfills-license.md');
