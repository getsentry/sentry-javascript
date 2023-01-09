import * as childProcess from 'child_process';
import * as fs from 'fs';

const CURRENT_NODE_VERSION = process.version.replace('v', '').split('.')[0];

const DEFAULT_SKIP_TESTS_PACKAGES = [
  '@sentry-internal/eslint-plugin-sdk',
  '@sentry/ember',
  '@sentry/browser',
  '@sentry/vue',
  '@sentry/react',
  '@sentry/angular',
  '@sentry/svelte',
  '@sentry/replay',
  '@sentry/wasm',
];

// These packages don't support Node 8 for syntax or dependency reasons.
const NODE_8_SKIP_TESTS_PACKAGES = ['@sentry/gatsby', '@sentry/serverless', '@sentry/nextjs', '@sentry/remix'];

// We have to downgrade some of our dependencies in order to run tests in Node 8 and 10.
const NODE_8_LEGACY_DEPENDENCIES = [
  'jsdom@15.x',
  'jest@25.x',
  'jest-environment-jsdom@25.x',
  'jest-environment-node@25.x',
  'ts-jest@25.x',
  'lerna@3.13.4',
];

const NODE_10_SKIP_TESTS_PACKAGES = ['@sentry/remix'];
const NODE_10_LEGACY_DEPENDENCIES = ['jsdom@16.x', 'lerna@3.13.4'];

const NODE_12_SKIP_TESTS_PACKAGES = ['@sentry/remix'];
const NODE_12_LEGACY_DEPENDENCIES = ['lerna@3.13.4'];

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
function run(cmd: string, options?: childProcess.ExecSyncOptions): void {
  childProcess.execSync(cmd, { stdio: 'inherit', ...options });
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
 * Skip tests which don't run in Node 8.
 * We're forced to skip these tests for compatibility reasons.
 */
function skipNodeV8Tests(): void {
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
  const ignores = new Set<string>();

  DEFAULT_SKIP_TESTS_PACKAGES.forEach(dep => ignores.add(dep));

  switch (CURRENT_NODE_VERSION) {
    case '8':
      NODE_8_SKIP_TESTS_PACKAGES.forEach(dep => ignores.add(dep));
      installLegacyDeps(NODE_8_LEGACY_DEPENDENCIES);
      skipNodeV8Tests();
      es6ifyTestTSConfig('utils');
      break;
    case '10':
      NODE_10_SKIP_TESTS_PACKAGES.forEach(dep => ignores.add(dep));
      installLegacyDeps(NODE_10_LEGACY_DEPENDENCIES);
      es6ifyTestTSConfig('utils');
      break;
    case '12':
      NODE_12_SKIP_TESTS_PACKAGES.forEach(dep => ignores.add(dep));
      installLegacyDeps(NODE_12_LEGACY_DEPENDENCIES);
      es6ifyTestTSConfig('utils');
      break;
  }

  runWithIgnores(Array.from(ignores));
}

runTests();
