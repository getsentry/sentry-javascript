/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as rimraf from 'rimraf';

import { version } from '../package.json';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string {
  return String(childProcess.execSync(cmd, { stdio: 'inherit', ...options }));
}

async function buildLambdaLayer(): Promise<void> {
  // Create the main SDK bundle
  run('yarn rollup --config rollup.aws.config.mjs');

  // We build a minified bundle, but it's standing in for the regular `index.js` file listed in `package.json`'s `main`
  // property, so we have to rename it so it's findable.
  fs.renameSync(
    'build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs/index.min.js',
    'build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs/index.js',
  );

  // We're creating a bundle for the SDK, but still using it in a Node context, so we need to copy in `package.json`,
  // purely for its `main` property.
  console.log('Copying `package.json` into lambda layer.');
  fs.copyFileSync('package.json', 'build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/package.json');

  // The layer also includes `awslambda-auto.js`, a helper file which calls `Sentry.init()` and wraps the lambda
  // handler. It gets run when Node is launched inside the lambda, using the environment variable
  //
  //   `NODE_OPTIONS="-r @sentry/aws-serverless/dist/awslambda-auto"`.
  //
  // (The`-r` is what runs the script on startup.) The `dist` directory is no longer where we emit our built code, so
  // for backwards compatibility, we create a symlink.
  console.log('Creating symlink for `awslambda-auto.js` in legacy `dist` directory.');
  fsForceMkdirSync('build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/dist');
  fs.symlinkSync(
    '../build/npm/cjs/awslambda-auto.js',
    'build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/dist/awslambda-auto.js',
  );

  const zipFilename = `sentry-node-serverless-${version}.zip`;
  console.log(`Creating final layer zip file ${zipFilename}.`);
  // need to preserve the symlink above with -y
  run(`zip -r -y ${zipFilename} .`, { cwd: 'build/aws/dist-serverless' });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
buildLambdaLayer();

/**
 * Make a directory synchronously, overwriting the old directory if necessary.
 *
 * This is what `fs.mkdirSync(path, { force: true })` would be, if it existed. Primarily useful for local building and
 * testing, where scripts are often run more than once (and so the directory you're trying to create may already be
 * there), but also harmless when used in CI.
 */
function fsForceMkdirSync(path: string): void {
  rimraf.sync(path);
  fs.mkdirSync(path);
}
