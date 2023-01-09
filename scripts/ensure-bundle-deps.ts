/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

/**
 * Ensure that `build:bundle` has all of the dependencies it needs to run. Works at both the repo and package level.
 */
export async function ensureBundleBuildPrereqs(options: {
  dependencies: string[];
  maxRetries?: number;
}): Promise<void> {
  const { maxRetries = 12, dependencies } = options;

  const {
    // The directory in which the yarn command was originally invoked (which won't necessarily be the same as
    // `process.cwd()`)
    INIT_CWD: yarnInitialDir,
    // JSON containing the args passed to `yarn`
    npm_config_argv: yarnArgJSON,
  } = process.env;

  if (!yarnInitialDir || !yarnArgJSON) {
    const received = { INIT_CWD: yarnInitialDir, npm_config_argv: yarnArgJSON };
    throw new Error(
      `Missing environment variables needed for ensuring bundle dependencies. Received:\n${util.inspect(received)}\n`,
    );
  }

  // Did this build get invoked by a repo-level script, or a package-level script, and which script was it?
  const isTopLevelBuild = path.basename(yarnInitialDir) === 'sentry-javascript';
  const yarnScript = (JSON.parse(yarnArgJSON) as { original: string[] }).original[0];

  // convert '@sentry/xyz` to `xyz`
  const dependencyDirs = dependencies.map(npmPackageName => npmPackageName.split('/')[1]);

  // The second half of the conditional tests if this script is being run by the original top-level command or a
  // package-level command spawned by it.
  const packagesDir = isTopLevelBuild && yarnInitialDir === process.cwd() ? 'packages' : '..';

  if (checkForBundleDeps(packagesDir, dependencyDirs)) {
    // We're good, nothing to do, the files we need are there
    return;
  }

  // If we get here, the at least some of the dependencies are missing, but how we handle that depends on how we got
  // here. There are six possibilities:
  // - We ran `build` or `build:bundle` at the repo level
  // - We ran `build` or `build:bundle` at the package level
  // - We ran `build` or `build:bundle` at the repo level and lerna then ran `build:bundle` at the package level. (We
  //   shouldn't ever land here under this scenario - the top-level build should already have handled any missing
  //   dependencies - but it's helpful to consider all the possibilities.)
  //
  // In the first version of the first scenario (repo-level `build` -> repo-level `build:bundle`), all we have to do is
  // wait, because other parts of `build` are creating them as this check is being done. (Waiting 5 or 10 or even 15
  // seconds to start running `build:bundle` in parallel is better than pushing it to the second half of `build`,
  // because `build:bundle` is the slowest part of the build and therefore the one we most want to parallelize with
  // other slow parts, like `build:types`.)
  //
  // In all other scenarios, if the dependencies are missing, we have to build them ourselves - with `build:bundle` at
  // either level, we're the only thing happening (so no one's going to do it for us), and with package-level `build`,
  // types and npm assets are being built simultaneously, but only for the package being bundled, not for its
  // dependencies. Either way, it's on us to fix the problem.
  //
  // TODO: This actually *doesn't* work for package-level `build`, not because of a flaw in this logic, but because
  // `build:pack` has similar dependency needs (it needs types rather than npm builds). We should do something like
  // this for that at some point.

  if (isTopLevelBuild && yarnScript === 'build') {
    let retries = 0;

    console.log('\nSearching for bundle dependencies...');

    while (retries < maxRetries && !checkForBundleDeps(packagesDir, dependencyDirs)) {
      console.log('Bundle dependencies not found. Trying again in 5 seconds.');
      retries++;
      await sleep(5000);
    }

    if (retries === maxRetries) {
      throw new Error(
        `\nERROR: \`yarn build:bundle\` (triggered by \`yarn build\`) cannot find its depdendencies, despite waiting ${
          5 * maxRetries
        } seconds for the rest of \`yarn build\` to create them. Something is wrong - it shouldn't take that long. Exiting.`,
      );
    }

    console.log(`\nFound all bundle dependencies after ${retries} retries. Beginning bundle build...`);
  }

  // top-level `build:bundle`, package-level `build` and `build:bundle`
  else {
    console.warn('\nWARNING: Missing dependencies for bundle build. They will be built before continuing.');

    for (const dependencyDir of dependencyDirs) {
      console.log(`\nBuilding \`${dependencyDir}\` package...`);
      run('yarn build:pack', { cwd: `${packagesDir}/${dependencyDir}` });
    }

    console.log('\nAll dependencies built successfully. Beginning bundle build...');
  }
}

/**
 * See if all of the necessary dependencies exist
 */
function checkForBundleDeps(packagesDir: string, dependencyDirs: string[]): boolean {
  for (const dependencyDir of dependencyDirs) {
    const depBuildDir = `${packagesDir}/${dependencyDir}/build`;

    // Checking that the directories exist isn't 100% the same as checking that the files themselves exist, of course,
    // but it's a decent proxy, and much simpler to do than checking  for individual files.
    if (
      !(
        (fs.existsSync(`${depBuildDir}/cjs`) && fs.existsSync(`${depBuildDir}/esm`)) ||
        (fs.existsSync(`${depBuildDir}/npm/cjs`) && fs.existsSync(`${depBuildDir}/npm/esm`))
      )
    ) {
      // Fail fast
      return false;
    }
  }

  return true;
}

/**
 * Wait the given number of milliseconds before continuing.
 */
async function sleep(ms: number): Promise<void> {
  await new Promise(resolve =>
    setTimeout(() => {
      resolve();
    }, ms),
  );
}

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): string {
  return String(childProcess.execSync(cmd, { stdio: 'inherit', ...options }));
}

// TODO: Not ideal that we're hard-coding this, and it's easy to get when we're in a package directory, but would take
// more work to get from the repo level. Fortunately this list is unlikely to change very often, and we're the only ones
// we'll break if it gets out of date.
const dependencies = ['@sentry/utils', '@sentry/hub', '@sentry/core'];

if (['sentry-javascript', 'tracing', 'wasm'].includes(path.basename(process.cwd()))) {
  dependencies.push('@sentry/browser');
}

void ensureBundleBuildPrereqs({
  dependencies,
});
