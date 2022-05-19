/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as fs from 'fs';

import { ensureBundleBuildPrereqs } from '../../../scripts/ensure-bundle-deps';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string {
  return String(childProcess.execSync(cmd, { stdio: 'inherit', ...options }));
}

async function buildLambdaLayer(): Promise<void> {
  // Create the main SDK bundle
  await ensureBundleBuildPrereqs({
    dependencies: ['@sentry/utils', '@sentry/hub', '@sentry/core', '@sentry/tracing', '@sentry/node'],
  });
  run('yarn rollup --config rollup.aws.config.js');

  // We're creating a bundle for the SDK, but still using it in a Node context, so we need to copy in `package.json`,
  // purely for its `main` property.
  console.log('Copying `package.json` into lambda layer.');
  fs.copyFileSync('package.json', 'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/package.json');

  // The layer also includes `awslambda-auto.js`, a helper file which calls `Sentry.init()` and wraps the lambda
  // handler. It gets run when Node is launched inside the lambda, using the environment variable
  //
  //   `NODE_OPTIONS="-r @sentry/serverless/dist/awslambda-auto"`.
  //
  // (The`-r` is what runs the script on startup.) The `dist` directory is no longer where we emit our built code, but
  // for backwards compatibility, we copy it back there. (Copying seemed better than creating a symlink (because it's
  // simpler, and doesn't require any changes to GHA which does the zipping) and better than emitting it straight into
  // `dist` (because this way if we ever want to deprecate the old way, it's easy to do so).)
  console.log('Copying `awslambda-auto.js` into legacy `dist` directory.');
  fs.mkdirSync('build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/dist');
  fs.copyFileSync(
    'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/build/cjs/awslambda-auto.js',
    'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/dist/awslambda-auto.js',
  );
}

void buildLambdaLayer();

// // This is a wrapper around the SDK, which calls `Sentry.init()` and wraps the lambda handler. It gets run when Node
// // is launched inside the lambda, using the environment variable
// //
// //   `NODE_OPTIONS="-r @sentry/serverless/dist/awslambda-auto"`.
// //
// // (The`-r` is what runs the script on startup.) The `dist` directory is no longer where we emit our built code, so
// // for backwards compatibility, we create a symlink.
// fs.mkdirSync('build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/dist');
// fs.symlinkSync(
//   // TODO: Need to use `zip -y` to make sure that this symlink remains a symlink when it's zipped, and isn't
//   // materialized instead.
//   '../build/cjs/awslambda-auto.js',
//   'build/aws/dist-serverless/nodejs/node_modules/@sentry/serverless/dist/awslambda-auto.js',
// );
