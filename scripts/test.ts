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
  '@sentry/angular',
  '@sentry/remix',
  '@sentry/svelte', // svelte testing library requires Node >= 10
];

// We have to downgrade some of our dependencies in order to run tests in Node 8 and 10.
const NODE_8_LEGACY_DEPENDENCIES = [
  'jsdom@15.x',
  'jest@25.x',
  'jest-environment-jsdom@25.x',
  'jest-environment-node@25.x',
  'ts-jest@25.x',
];

const NODE_10_SKIP_TESTS_PACKAGES = [...DEFAULT_SKIP_TESTS_PACKAGES, '@sentry/remix'];
const NODE_10_LEGACY_DEPENDENCIES = ['jsdom@16.x'];

const NODE_12_SKIP_TESTS_PACKAGES = [...DEFAULT_SKIP_TESTS_PACKAGES, '@sentry/remix'];

type JSONValue = string | number | boolean | null | JSONArray | JSONObject;

type JSONObject = {
  [key: string]: JSONValue;
};
type JSONArray = Array<JSONValue>;

interface TSConfigJSON extends JSONObject {
  compilerOptions: { lib: string[]; target: string };
}

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions) {
  return childProcess.execSync(cmd, { stdio: 'inherit', ...options });
}

/**
 * Install the given legacy dependencies, for compatibility with tests run in older versions of Node.
 */
function installLegacyDeps(legacyDeps: string[] = []): void {
  // Ignoring engines and scripts lets us get away with having incompatible things installed for SDK packages we're not
  // testing in the current node version, and ignoring the root check lets us install things at the repo root.
  run(`yarn add --dev --ignore-engines --ignore-scripts --ignore-workspace-root-check ${legacyDeps.join(' ')}`);
}

/**
 * Add a tranformer to our jest config, to do the same `const`-to-`var` replacement as our rollup plugin does.
 *
 * This is needed because Node 8 doesn't like the way we shadow `global` (`const global = getGlobalObject()`). Changing
 * it to a `var` solves this by making it redeclarable.
 *
 */
function addJestTransformer(): void {
  // Though newer `ts-jest` versions support transformers written in TS, the legacy version does not.
  run('yarn tsc --skipLibCheck jest/transformers/constReplacer.ts');

  // Loading the existing Jest config will error out unless the config file has an accompanying types file, so we have
  // to create that before we can load it.
  run('yarn tsc --allowJs --skipLibCheck --declaration --emitDeclarationOnly jest/jest.config.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jestConfig = require('../jest/jest.config.js');

  // Inject the transformer
  jestConfig.globals['ts-jest'].astTransformers = ['<rootDir>/../../jest/transformers/constReplacer.js'];

  // When we required the jest config file above, all expressions it contained were evaluated. Specifically, the
  //     `rootDir: process.cwd()`
  // entry was replaced with
  //     `rootDir: "<hard-coded string result of running `process.cwd()` in the current process>"`,
  // Though it's a little brute-force-y, the easiest way to fix this is to just stringify the code and perform the
  // substitution in reverse.
  const stringifiedConfig = JSON.stringify(jestConfig, null, 2).replace(
    `"rootDir": "${process.cwd()}"`,
    'rootDir: process.cwd()',
  );

  // Now we just have to convert it back to a module and write it to disk
  const code = `module.exports = ${stringifiedConfig}`;
  fs.writeFileSync(path.resolve('jest/jest.config.js'), code);
}

/**
 * Modify a json file on disk.
 *
 * @param filepath The path to the file to be modified
 * @param transformer A function which takes the JSON data as input and returns a mutated version. It may mutate the
 * JSON data in place, but it isn't required to do so.
 */
export function modifyJSONFile(filepath: string, transformer: (json: JSONObject) => JSONObject): void {
  const fileContents = fs
    .readFileSync(filepath)
    .toString()
    // get rid of comments, which the `jsonc` format allows, but which will crash `JSON.parse`
    .replace(/\/\/.*\n/g, '');
  const json = JSON.parse(fileContents);
  const newJSON = transformer(json);
  fs.writeFileSync(filepath, JSON.stringify(newJSON, null, 2));
}

const es6ifyTestTSConfig = (pkg: string): void => {
  const filepath = `packages/${pkg}/tsconfig.test.json`;
  const transformer = (json: JSONObject): JSONObject => {
    const tsconfig = json as TSConfigJSON;
    tsconfig.compilerOptions.target = 'es6';
    return json;
  };
  modifyJSONFile(filepath, transformer);
};

/**
 * Skip tests which don't apply to Node and therefore don't need to run in older Node versions.
 *
 * TODO We're foreced to skip these tests for compatibility reasons (right now this function only gets called in Node
 * 8), but we could be skipping a lot more tests in Node 8-14 - anything where compatibility with different Node
 * versions is irrelevant - and only running them in Node 16.
 */
function skipNonNodeTests(): void {
  run('rm -rf packages/tracing/test/browser');
}

/**
 * Run tests, ignoring the given packages
 */
function runWithIgnores(skipPackages: string[] = []): void {
  const ignoreFlags = skipPackages.map(dep => `--ignore="${dep}"`).join(' ');
  run(`yarn test ${ignoreFlags}`);
}

/**
 * Run the tests, accounting for compatibility problems in older versions of Node.
 */
function runTests(): void {
  if (CURRENT_NODE_VERSION === '8') {
    installLegacyDeps(NODE_8_LEGACY_DEPENDENCIES);
    // Inject a `const`-to-`var` transformer, in order to stop Node 8 from complaining when we shadow `global`
    addJestTransformer();
    // TODO Right now, this just skips incompatible tests, but it could be skipping more (hence the aspirational name),
    // and not just in Node 8. See `skipNonNodeTests`'s docstring.
    skipNonNodeTests();
    es6ifyTestTSConfig('utils');
    runWithIgnores(NODE_8_SKIP_TESTS_PACKAGES);
  }
  //
  else if (CURRENT_NODE_VERSION === '10') {
    installLegacyDeps(NODE_10_LEGACY_DEPENDENCIES);
    es6ifyTestTSConfig('utils');
    runWithIgnores(NODE_10_SKIP_TESTS_PACKAGES);
  }
  //
  else if (CURRENT_NODE_VERSION === '12') {
    es6ifyTestTSConfig('utils');
    runWithIgnores(NODE_12_SKIP_TESTS_PACKAGES);
  }
  //
  else {
    runWithIgnores(DEFAULT_SKIP_TESTS_PACKAGES);
  }
}

runTests();
