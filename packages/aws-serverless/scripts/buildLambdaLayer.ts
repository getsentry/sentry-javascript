/* eslint-disable no-console */
import { nodeFileTrace } from '@vercel/nft';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
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
 * Finally, create a zip file of the layer.
 */
async function buildLambdaLayer(): Promise<void> {
  console.log('Building Lambda layer.');
  buildPackageJson();
  console.log('Installing local @sentry/aws-serverless into build/aws/dist-serverless/nodejs.');
  // Use a temporary store directory to avoid stale cache references to local file: packages.
  // The store must be outside the monorepo to avoid recursive nesting when pnpm
  // follows file: links and copies package directories.
  const storeDir = path.join(os.tmpdir(), `sentry-lambda-build-store-${Date.now()}`);
  run(`pnpm install --prod --store-dir "${storeDir}"`, { cwd: './build/aws/dist-serverless/nodejs' });

  await pruneNodeModules();
  fs.rmSync('./build/aws/dist-serverless/nodejs/package.json', { force: true });
  fs.rmSync('./build/aws/dist-serverless/nodejs/pnpm-workspace.yaml', { force: true });
  fs.rmSync('./build/aws/dist-serverless/nodejs/pnpm-lock.yaml', { force: true });
  fs.rmSync(storeDir, { recursive: true, force: true });

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

  replaceSDKSource();

  // Copy the Lambda extension from the shared build output into the layer structure.
  // build/lambda-extension/ contains both index.mjs and the sentry-extension wrapper.
  // Lambda requires the wrapper to be in /opt/extensions/ for auto-discovery,
  // so it gets copied there separately.
  fs.cpSync('./build/lambda-extension', './build/aws/dist-serverless/sentry-extension', { recursive: true });
  fs.chmodSync('./build/aws/dist-serverless/sentry-extension/index.mjs', 0o755);
  fsForceMkdirSync('./build/aws/dist-serverless/extensions');
  fs.copyFileSync(
    './build/aws/dist-serverless/sentry-extension/sentry-extension',
    './build/aws/dist-serverless/extensions/sentry-extension',
  );
  fs.chmodSync('./build/aws/dist-serverless/extensions/sentry-extension', 0o755);

  const zipFilename = `sentry-node-serverless-${version}.zip`;
  // Only include these directories in the zip file
  const dirsToZip = ['nodejs', 'extensions', 'sentry-extension'];
  console.log(`Creating final layer zip file ${zipFilename}.`);
  // need to preserve the symlink above with -y
  run(`zip -r -y ${zipFilename} ${dirsToZip.join(' ')}`, { cwd: 'build/aws/dist-serverless' });

  // Cleanup temporary installation files
  fs.rmSync('build/aws/dist-serverless/nodejs/', { recursive: true, force: true });
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
  fs.mkdirSync(path, { recursive: true });
}

async function pruneNodeModules(): Promise<void> {
  const entrypoints = [
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/esm/index.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs/index.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/cjs/awslambda-auto.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/esm/awslambda-auto.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/aws-serverless/build/npm/run-lambda-handler.mjs',
  ];

  const { fileList } = await nodeFileTrace(entrypoints, {
    // import-in-the-middle uses mixed require and import syntax in their `hook.mjs` file.
    // So we need to set `mixedModules` to `true` to ensure that all modules are tracked.
    mixedModules: true,
  });

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
  } catch {
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

function buildPackageJson(): void {
  console.log('Building package.json');
  const packagesDir = path.resolve(__dirname, '../..');
  const packageDirs = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => !name.startsWith('.')) // Skip hidden directories
    .sort();

  const overrides: Record<string, string> = {};

  for (const packageDir of packageDirs) {
    const packageJsonPath = path.join(packagesDir, packageDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { name?: string };
        const packageName = packageContent.name;
        if (typeof packageName === 'string' && packageName) {
          overrides[packageName] = `file:../../../../../../packages/${packageDir}`;
        }
      } catch {
        console.warn(`Warning: Could not read package.json for ${packageDir}`);
      }
    }
  }

  const packageJson = {
    dependencies: {
      '@sentry/aws-serverless': 'file:../../../../../../packages/aws-serverless',
    },
  };

  fsForceMkdirSync('./build/aws/dist-serverless/nodejs');
  const packageJsonPath = './build/aws/dist-serverless/nodejs/package.json';
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // pnpm reads the overrides only from pnpm-workspace.yaml. This file also makes the folder the workspace root, so
  // pnpm does not install the monorepo. `nodeLinker: hoisted` gives a flat node_modules folder without symlinks,
  // which `pruneNodeModules` expects.
  const workspaceLines = [
    'nodeLinker: hoisted',
    'overrides:',
    ...Object.entries(overrides).map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`),
  ];
  fs.writeFileSync('./build/aws/dist-serverless/nodejs/pnpm-workspace.yaml', `${workspaceLines.join('\n')}\n`);
}

function replaceSDKSource(): void {
  console.log('Replacing SDK source.');

  const envFiles = [
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/core/build/cjs/utils/env.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/core/build/esm/utils/env.js',
  ];

  // Tolerant of whitespace/quote variations: esbuild emits the marker and `return` on
  // separate lines and uses double quotes, while the source uses a single line and single
  // quotes. The marker itself uses `/*! */` legal-comment syntax so esbuild preserves it.
  const pattern = /\/\*! __SENTRY_SDK_SOURCE__ \*\/\s*return ["']npm["'];/;
  const replacement = `/*! __SENTRY_SDK_SOURCE__ */ return 'aws-lambda-layer';`;

  for (const envFile of envFiles) {
    let content: string;
    try {
      content = fs.readFileSync(envFile, 'utf-8');
    } catch {
      throw new Error(`Could not read ${envFile} while updating the SDK source for the Lambda layer.`);
    }

    if (!pattern.test(content)) {
      throw new Error(
        `Could not find the __SENTRY_SDK_SOURCE__ marker in ${envFile}. The Lambda layer would silently report its SDK source as 'npm'. Has the marker or the transpile output changed?`,
      );
    }

    // pnpm hard-links the files of `file:` dependencies to the monorepo packages. Removing the file first makes
    // sure that the write does not also change `packages/core/build`.
    fs.rmSync(envFile);
    fs.writeFileSync(envFile, content.replace(pattern, replacement));
    console.log(`Updated SDK source in ${envFile}`);
  }
}
