/* eslint-disable no-console */
import { nodeFileTrace } from '@vercel/nft';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { version } from '../package.json';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string {
  return String(childProcess.execSync(cmd, { stdio: 'inherit', ...options }));
}

/**
 * Build the AWS lambda layer by first installing the local package into `build/aws/dist-serverless/nodejs`.
 * Then, prune the node_modules directory to remove unused files by first getting all necessary files with
 * `@vercel/nft` and then deleting all other files inside `node_modules`.
 * Finally, minify the files and create a zip file of the layer.
 */
async function buildLambdaLayer(): Promise<void> {
  console.log('Installing local @sentry/aws-serverless into build/aws/dist-serverless/nodejs.');
  run('npm install . --prefix ./build/aws/dist-serverless/nodejs --install-links --silent');

  await pruneNodeModules();
  fs.unlinkSync('./build/aws/dist-serverless/nodejs/package.json');
  fs.unlinkSync('./build/aws/dist-serverless/nodejs/package-lock.json');

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
  fs.rmSync(path, { recursive: true, force: true });
  fs.mkdirSync(path);
}

async function pruneNodeModules(): Promise<void> {
  const entrypoints = [
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/esm/index.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs/index.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs/awslambda-auto.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/esm/awslambda-auto.js',
  ];

  const { fileList } = await nodeFileTrace(entrypoints);

  const allFiles = getAllFiles('./build/aws/dist-serverless/nodejs/node_modules');

  const filesToDelete = allFiles.filter(file => !fileList.has(file));
  console.log(`Removing ${filesToDelete.length} unused files from node_modules.`);

  for (const file of filesToDelete) {
    try {
      fs.unlinkSync(file);
    } catch {
      console.error(`Error deleting ${file}`);
    }
  }

  console.log('Cleaning up empty directories.');

  removeEmptyDirs('./build/aws/dist-serverless/nodejs/node_modules');
}

function removeEmptyDirs(dir: string): void {
  try {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        removeEmptyDirs(fullPath);
      }
    }

    const remainingEntries = fs.readdirSync(dir);

    if (remainingEntries.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch (error) {
    // Directory might not exist or might not be empty, that's ok
  }
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function walkDirectory(currentPath: string): void {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);

        if (entry.isDirectory()) {
          walkDirectory(fullPath);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      console.log(`Skipping directory ${currentPath}`);
    }
  }

  walkDirectory(dir);
  return files;
}
