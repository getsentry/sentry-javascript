import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string | Buffer {
  return childProcess.execSync(cmd, { stdio: 'inherit', ...options });
}

run('yarn rollup -c rollup.npm.config.mjs');

// Regardless of whether nextjs is using the CJS or ESM version of our SDK, we want the code from our templates to be in
// ESM (since we'll be adding it onto page files which are themselves written in ESM), so copy the ESM versions of the
// templates over into the CJS build directory. (Building only the ESM version and sticking it in both locations is
// something which in theory Rollup could do, but it would mean refactoring our Rollup helper functions, which isn't
// worth it just for this.)
const cjsTemplateDir = 'build/cjs/config/templates/';
const esmTemplateDir = 'build/esm/config/templates/';
fs.readdirSync(esmTemplateDir).forEach(templateFile =>
  fs.copyFileSync(path.join(esmTemplateDir, templateFile), path.join(cjsTemplateDir, templateFile)),
);
