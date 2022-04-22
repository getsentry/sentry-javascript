import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// import * as jestConfig from '../jest/jest.config.js';

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current process.
 *
 * @param cmd The command to run
 * @param options Options (other than `stdio`) to pass to the underlying `execSync` command.
 * @returns The child process's outpout on `stdout`
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions) {
  return childProcess.execSync(cmd, { stdio: 'inherit', ...options });

  // if (result.status !== 0) {
  //   process.exit(result.status || undefined);
  // }
}

// const nodeMajorVersion = 8;
const nodeMajorVersion = parseInt(process.version.split('.')[0].replace('v', ''), 10);

// Ember tests require dependency changes for each set of tests, making them quite slow. To compensate for this, in CI
// we run them in a separate, parallel job.
let ignorePackages = ['@sentry/ember'];

// install legacy versions of third-party packages whose current versions don't support node 8 or 10, and skip testing
// our own packages which don't support node 8 for various syntax or dependency reasons
if (nodeMajorVersion <= 10) {
  let legacyDependencies: string[];

  if (nodeMajorVersion === 8) {
    legacyDependencies = [
      'jsdom@15.x',
      'jest@25.x',
      'jest-environment-jsdom@25.x',
      'jest-environment-node@25.x',
      'ts-jest@25.x',
    ];

    ignorePackages = [
      ...ignorePackages,
      '@sentry-internal/eslint-plugin-sdk',
      '@sentry/react',
      '@sentry/wasm',
      '@sentry/gatsby',
      '@sentry/serverless',
      '@sentry/nextjs',
      '@sentry/angular',
    ];

    // The ts-jest config schema changed between v25 and v26. Because we're about to downgrade to v25, we have to adjust
    // our config to match.

    // Loading the existing jest config will error out unless it has an accompanying types file.
    run('yarn tsc --allowJs --skipLibCheck --declaration --emitDeclarationOnly jest/jest.config.js');

    // Because we're loading this partway through the script, we have to use `require`.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jestConfig = require('../jest/jest.config.js');

    // We need to cast the new `astTransformers` value to `any` because it violates the ts-jest v26+ schema, on which
    // the types file we generated above is based.
    jestConfig.globals['ts-jest'].astTransformers = jestConfig.globals['ts-jest'].astTransformers.after as any;

    // The rest of the fixes we need to make are more easily done on the stringified code
    let code = `module.exports = ${JSON.stringify(jestConfig, null, 2)}`;

    // When we imported the jest config above, all expressions it contained were evaluated. Specifically, the
    // `process.cwd()` call was replaced with a hard-coded path, which will break as soon as the jest config needs to be
    // used in a different directory than this one. Though it's a little brute-force-y, the easiest way to fix this is
    // just to perform the substitution in reverse.
    code = code.replace(`"rootDir": "${process.cwd()}"`, 'rootDir: process.cwd()');

    // Finally, it seems older versions of ts-jest need the transformer to be in JS from the start (newer versions will
    // transpile it on their own), so we need to both compile it and change the extension in the filename in our config.
    run('yarn tsc --skipLibCheck jest/transformers/constReplacer.ts');
    code = code.replace('constReplacer.ts', 'constReplacer.js');

    fs.writeFileSync(path.resolve('jest/jest.config.js'), code);

    // This is a hack, to deal the fact that the browser-based tests fail under Node 8, because of a conflict buried
    // somewhere in the interaction between our current overall set of dependencies and the older versions of a small
    // subset we're about to install below. Since they're browser-based, these tests are never going to be running in a
    // node 8 environment in any case, so it's fine to skip them here. (In the long run, we should only run such tests
    // against a single version of node, but in the short run, this at least allows us to not be blocked by the
    // failures.)
    run('rm -rf packages/tracing/test/browser');

    // TODO Pull this out once we switch to sucrase builds
    // Recompile as es5, so as not to have to fix a compatibility problem that will soon be moot
    const baseTSConfig = 'packages/typescript/tsconfig.json';
    fs.writeFileSync(baseTSConfig, String(fs.readFileSync(baseTSConfig)).replace('"target": "es6"', '"target": "es5"'));
    run(`yarn build:dev ${ignorePackages.map(dep => `--ignore="${dep}"`).join(' ')}`);
  }
  // Node 10
  else {
    legacyDependencies = ['jsdom@16.x'];
  }

  const legacyDepStr = legacyDependencies.join(' ');

  // ignoring engines and scripts lets us get away with having incompatible things installed for packages we're not testing
  run(`yarn add --dev --ignore-engines --ignore-scripts --ignore-workspace-root-check ${legacyDepStr}`);
}

const ignoreFlags = ignorePackages.map(dep => `--ignore="${dep}"`).join(' ');

run(`yarn test ${ignoreFlags}`);

process.exit(0);
