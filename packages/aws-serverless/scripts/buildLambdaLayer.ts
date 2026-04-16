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
 * Finally, create a zip file of the layer.
 */
async function buildLambdaLayer(): Promise<void> {
  console.log('Building Lambda layer.');
  const tarballDir = buildTarballsAndPackageJson();
  console.log('Installing @sentry/aws-serverless from tarballs into build/aws/dist-serverless/nodejs.');
  run('yarn install --prod --cwd ./build/aws/dist-serverless/nodejs');

  await pruneNodeModules();
  fs.rmSync('./build/aws/dist-serverless/nodejs/package.json', { force: true });
  fs.rmSync('./build/aws/dist-serverless/nodejs/yarn.lock', { force: true });
  fs.rmSync(tarballDir, { recursive: true, force: true });

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

/**
 * Pack @sentry/* packages into tarballs and generate a package.json that references them.
 *
 * Using tarballs instead of `file:` directory references avoids stale yarn cache issues
 * (where yarn's global cache retains outdated build artifact paths from previous builds)
 * and allows us to use yarn's global cache for faster installs.
 *
 * Only packs packages that are transitive dependencies of @sentry/aws-serverless to keep
 * the packing step fast.
 */
function buildTarballsAndPackageJson(): string {
  const tarballDir = path.resolve('./build/aws/tarballs');
  fsForceMkdirSync(tarballDir);

  const packagesDir = path.resolve(__dirname, '../..');
  const sentryPackages = collectSentryDependencies(packagesDir);

  console.log(`Packing ${sentryPackages.size} @sentry/* packages into tarballs.`);

  const resolutions: Record<string, string> = {};

  for (const [packageName, packageDir] of sentryPackages) {
    run(`npm pack --pack-destination "${tarballDir}"`, {
      cwd: path.join(packagesDir, packageDir),
      stdio: 'pipe',
    });
    const tarballName = `${packageName.replace('@', '').replace('/', '-')}-${version}.tgz`;
    resolutions[packageName] = `file:${path.join(tarballDir, tarballName)}`;
  }

  const awsServerlessTarball = resolutions['@sentry/aws-serverless'];
  if (!awsServerlessTarball) {
    throw new Error('Failed to pack @sentry/aws-serverless');
  }

  const packageJson = {
    dependencies: {
      '@sentry/aws-serverless': awsServerlessTarball,
    },
    resolutions,
  };

  fsForceMkdirSync('./build/aws/dist-serverless/nodejs');
  fs.writeFileSync('./build/aws/dist-serverless/nodejs/package.json', JSON.stringify(packageJson, null, 2));

  return tarballDir;
}

/**
 * Collect all @sentry/* and @sentry-internal/* packages that are transitive
 * dependencies of @sentry/aws-serverless.
 * Returns a Map of packageName -> directory name.
 */
function collectSentryDependencies(packagesDir: string): Map<string, string> {
  const result = new Map<string, string>();

  // Build a lookup of package name -> directory name
  const nameToDir = new Map<string, string>();
  for (const dirent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue;
    const pkgPath = path.join(packagesDir, dirent.name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
    if (pkg.name) {
      nameToDir.set(pkg.name, dirent.name);
    }
  }

  function collect(packageName: string): void {
    if (result.has(packageName)) return;
    const dir = nameToDir.get(packageName);
    if (!dir) return;
    result.set(packageName, dir);
    const pkgPath = path.join(packagesDir, dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(pkg.dependencies || {})) {
      if (dep.startsWith('@sentry/') || dep.startsWith('@sentry-internal/')) {
        collect(dep);
      }
    }
  }

  collect('@sentry/aws-serverless');
  return result;
}

function replaceSDKSource(): void {
  console.log('Replacing SDK source.');

  const envFiles = [
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/core/build/cjs/utils/env.js',
    './build/aws/dist-serverless/nodejs/node_modules/@sentry/core/build/esm/utils/env.js',
  ];

  for (const envFile of envFiles) {
    try {
      let content = fs.readFileSync(envFile, 'utf-8');

      // Replace the line marked with __SENTRY_SDK_SOURCE__ comment
      // Change from 'npm' to 'aws-lambda-layer' to identify that this is the AWS Lambda layer
      content = content.replace(
        "/* __SENTRY_SDK_SOURCE__ */ return 'npm';",
        "/* __SENTRY_SDK_SOURCE__ */ return 'aws-lambda-layer';",
      );

      fs.writeFileSync(envFile, content);
      console.log(`Updated SDK source in ${envFile}`);
    } catch {
      console.warn(`Warning: Could not update SDK source in ${envFile}`);
    }
  }
}
