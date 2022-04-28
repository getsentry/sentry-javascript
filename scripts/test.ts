import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CURRENT_NODE_VERSION = process.version.replace('v', '').split('.')[0];

// We run ember tests in their own job.
const DEFAULT_SKIP_TESTS_PACKAGES = ['@sentry/ember'];
// These packages don't support Node 8 for syntax or dependency reasons.
const NODE_8_SKIP_TESTS_PACKAGES = [
  ...DEFAULT_SKIP_TESTS_PACKAGES,
  '@sentry-internal/eslint-plugin-sdk',
  '@sentry/react',
  '@sentry/wasm',
  '@sentry/gatsby',
  '@sentry/serverless',
  '@sentry/nextjs',
];

// We have to downgrade some of our dependencies in order to run tests in Node 8 and 10.
const NODE_8_LEGACY_DEPENDENCIES = [
  'jsdom@15.x',
  'jest@25.x',
  'jest-environment-jsdom@25.x',
  'jest-environment-node@25.x',
  'ts-jest@25.x',
];
const NODE_10_LEGACY_DEPENDENCIES = ['jsdom@16.x'];

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current process.
 *
 * @param cmd The command to run
 * @param options Options (other than `stdio`) to pass to the underlying `execSync` command.
 * @returns The child process's outpout on `stdout`
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions) {
  return childProcess.execSync(cmd, { stdio: 'inherit', ...options });
}

/** Install the given legacy dependencies, for compatibility with tests run in older versions of Node. */
function installLegacyDeps(legacyDeps: string[] = []): void {
  // Ignoring engines and scripts lets us get away with having incompatible things installed for SDK packages we're not
  // testing in the current node version, and ignoring the root check lets us install things at the repo root.
  run(`yarn add --dev --ignore-engines --ignore-scripts --ignore-workspace-root-check ${legacyDeps.join(' ')}`);
}

/** Run tests, ignoring the given packages */
function runTests(skipPackages: string[] = []): void {
  const ignoreFlags = skipPackages.map(dep => `--ignore="${dep}"`).join(' ');
  run(`yarn test ${ignoreFlags}`);
}

/** Downgrade our Jest config and our Jest transformer to be compatible with ts-jest v25. */
function downgradeJestConfig(): void {
  // The ts-jest config schema changed between v25 and v26. Because for Node 8 we downgrade to v25, we have to adjust
  // our config to match.

  // (For context, in v25, the `astTransformers` value was an array of paths to transformers. In v26+, that array is
  // wrapped in an object with `before`, `after`, and `afterDeclarations` keys, to allow the transformers to be run at
  // different points in the compilation process.)

  // Loading the existing Jest config will error out unless the config file has an accompanying types file, so we have
  // to create that before we can load it.
  run('yarn tsc --allowJs --skipLibCheck --declaration --emitDeclarationOnly jest/jest.config.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jestConfig = require('../jest/jest.config.js');

  // Unwrap the transformers array. (Since the old and new schemas don't match, we need to cast the new
  // `astTransformers` value to `any`.)
  jestConfig.globals['ts-jest'].astTransformers = jestConfig.globals['ts-jest'].astTransformers.after as any;

  // The rest of the fixes we need to make are more easily done on a stringified version of the config code (which we'll
  // need in the end anyway), so do that now.
  let code = `module.exports = ${JSON.stringify(jestConfig, null, 2)}`;

  // When we required the jest config file above, all expressions it contained were evaluated. Specifically, the
  //     `rootDir: process.cwd()`
  // entry was replaced with
  //     `rootDir: "<hard-coded string result of running `process.cwd()` in the current process>"`,
  // Though it's a little brute-force-y, the easiest way to fix this is just to perform the substitution in reverse.
  code = code.replace(`"rootDir": "${process.cwd()}"`, 'rootDir: process.cwd()');

  // It seems older versions of ts-jest need the transformer to be in JS from the start (newer versions will transpile
  // it on their own), so we need to both compile the transformer and change the file extension in our stringified
  // config.
  run('yarn tsc --skipLibCheck jest/transformers/constReplacer.ts');
  code = code.replace('constReplacer.ts', 'constReplacer.js');

  // Finally, replace the current config with the down-graded version
  fs.writeFileSync(path.resolve('jest/jest.config.js'), code);
}

// TODO We're foreced to skip these tests for compatibility reasons (right now this function only gets called in Node
// 8), but we could be skipping a lot more tests in Node 8 - 14 - anything where compatibility with different Node
// versions is irrelevant - and only running them in Node 16.
function skipNonNodeTests(): void {
  run('rm -rf packages/tracing/test/browser');
}

if (CURRENT_NODE_VERSION === '8') {
  installLegacyDeps(NODE_8_LEGACY_DEPENDENCIES);
  downgradeJestConfig();

  // TODO Right now, this just skips incompatible tests, but it could be skipping more. See `skipNonNodeTests`'s
  // docstring.
  skipNonNodeTests();

  runTests(NODE_8_SKIP_TESTS_PACKAGES);
} else if (CURRENT_NODE_VERSION === '10') {
  installLegacyDeps(NODE_10_LEGACY_DEPENDENCIES);
  runTests(DEFAULT_SKIP_TESTS_PACKAGES);
} else {
  runTests(DEFAULT_SKIP_TESTS_PACKAGES);
}
// // const nodeMajorVersion = 8;
// // const CURRENT_NODE_VERSION = parseInt(process.version.split('.')[0].replace('v', ''), 10);
//
// // Ember tests require dependency changes for each set of tests, making them quite slow. To compensate for this, in CI
// // we run them in a separate, parallel job.
// let defaultIgnorePackages = ['@sentry/ember'];
//
// // install legacy versions of third-party packages whose current versions don't support node 8 or 10, and skip testing
// // our own packages which don't support node 8 for various syntax or dependency reasons
// if (CURRENT_NODE_VERSION <= 10) {
//   let legacyDependencies: string[];
//
//   if (CURRENT_NODE_VERSION === 8) {
//     legacyDependencies = [
//       'jsdom@15.x',
//       'jest@25.x',
//       'jest-environment-jsdom@25.x',
//       'jest-environment-node@25.x',
//       'ts-jest@25.x',
//     ];
//
//     defaultIgnorePackages = [
//       ...defaultIgnorePackages,
//       '@sentry-internal/eslint-plugin-sdk',
//       '@sentry/react',
//       '@sentry/wasm',
//       '@sentry/gatsby',
//       '@sentry/serverless',
//       '@sentry/nextjs',
//     ];
//
//     // The ts-jest config schema changed between v25 and v26. Because we're about to downgrade to v25, we have to adjust
//     // our config to match.
//
//     // (For context, in v25, the `astTransformers` value was an array of paths to transformers. In v26+, that array is
//     // wrapped in an object with `before`, `after`, and `afterDeclarations` keys, to allow the transformers to be run at
//     // different points in the compilation process.)
//
//     // We couldn't import the existing config at the top of this script, because loading it will error out unless the
//     // config file has an accompanying types file, so we have to create that before we load the existing config.
//     run('yarn tsc --allowJs --skipLibCheck --declaration --emitDeclarationOnly jest/jest.config.js');
//     // eslint-disable-next-line @typescript-eslint/no-var-requires
//     const jestConfig = require('../jest/jest.config.js');
//
//     // Unwrap the transformers array. (Since the old and new schemas don't match, we need to cast the new
//     // `astTransformers` value to `any`.)
//     jestConfig.globals['ts-jest'].astTransformers = jestConfig.globals['ts-jest'].astTransformers.after as any;
//
//     // The rest of the fixes we need to make are more easily done on a stringified version of the config code (which
//     // we'll need in the end anyway), so do that now.
//     let code = `module.exports = ${JSON.stringify(jestConfig, null, 2)}`;
//
//     // When we required the jest config file above, all expressions it contained were evaluated. Specifically, the
//     //     `rootDir: process.cwd()`
//     // entry was replaced with
//     //     `rootDir: "<hard-coded string result of running `process.cwd()` in the current process>"`,
//     // Though it's a little brute-force-y, the easiest way to fix this is just to perform the substitution in reverse.
//     code = code.replace(`"rootDir": "${process.cwd()}"`, 'rootDir: process.cwd()');
//
//     // It seems older versions of ts-jest need the transformer to be in JS from the start (newer versions will transpile
//     // it on their own), so we need to both compile it and change the file extension in our stringified config.
//     run('yarn tsc --skipLibCheck jest/transformers/constReplacer.ts');
//     code = code.replace('constReplacer.ts', 'constReplacer.js');
//
//     // Finally, replace the current config with the down-graded version
//     fs.writeFileSync(path.resolve('jest/jest.config.js'), code);
//
//     // This is a hack, to deal the fact that the browser-based tests fail under Node 8, because of a conflict buried
//     // somewhere in the interaction between our current overall set of dependencies and the older versions of a small
//     // subset we're about to install below. Since they're browser-based, these tests are never going to be running in a
//     // node 8 environment in any case, so it's fine to skip them here. (In the long run, we should only run such tests
//     // against a single version of node, but in the short run, this at least allows us to not be blocked by the
//     // failures.)
//     run('rm -rf packages/tracing/test/browser');
//   }
//   // Node 10
//   else {
//     legacyDependencies = ['jsdom@16.x'];
//   }
//
//   const legacyDepStr = legacyDependencies.join(' ');
//
//   // ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
//   run(`yarn add --dev --ignore-engines --ignore-scripts --ignore-workspace-root-check ${legacyDepStr}`);
// }
//
// const ignoreFlags = defaultIgnorePackages.map(dep => `--ignore="${dep}"`).join(' ');
//
// run(`yarn test ${ignoreFlags}`);
//
// process.exit(0);
