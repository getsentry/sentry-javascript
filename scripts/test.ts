import * as childProcess from 'child_process';
import * as fs from 'fs';

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
  '@sentry/replay',
];

// We have to downgrade some of our dependencies in order to run tests in Node 8 and 10.
const NODE_8_LEGACY_DEPENDENCIES = [
  'jsdom@15.x',
  'jest@25.x',
  'jest-environment-jsdom@25.x',
  'jest-environment-node@25.x',
  'ts-jest@25.x',
];

const NODE_10_SKIP_TESTS_PACKAGES = [...DEFAULT_SKIP_TESTS_PACKAGES, '@sentry/remix', '@sentry/replay'];
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
