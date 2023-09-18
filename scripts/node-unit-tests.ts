import * as childProcess from 'child_process';
import * as fs from 'fs';

const CURRENT_NODE_VERSION = process.version.replace('v', '').split('.')[0];

type NodeVersions = '8' | '10' | '12' | '14' | '16';

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
  '@sentry/bun',
];

const SKIP_TEST_PACKAGES: Record<
  NodeVersions,
  {
    ignoredPackages: Array<`@${'sentry' | 'sentry-internal'}/${string}`>;
    legacyDeps: Array<`${string}@${string}`>;
    shouldES6Utils: boolean;
  }
> = {
  '8': {
    ignoredPackages: [
      '@sentry/gatsby',
      '@sentry/serverless',
      '@sentry/nextjs',
      '@sentry/remix',
      '@sentry/sveltekit',
      '@sentry-internal/replay-worker',
      '@sentry/node-experimental',
      '@sentry/vercel-edge',
    ],
    legacyDeps: [
      'jsdom@15.x',
      'jest@25.x',
      'jest-environment-jsdom@25.x',
      'jest-environment-node@25.x',
      'ts-jest@25.x',
      'lerna@3.13.4',
    ],
    shouldES6Utils: true,
  },
  '10': {
    ignoredPackages: [
      '@sentry/remix',
      '@sentry/sveltekit',
      '@sentry-internal/replay-worker',
      '@sentry/node-experimental',
      '@sentry/vercel-edge',
    ],
    legacyDeps: ['jsdom@16.x', 'lerna@3.13.4'],
    shouldES6Utils: true,
  },
  '12': {
    ignoredPackages: ['@sentry/remix', '@sentry/sveltekit', '@sentry/node-experimental', '@sentry/vercel-edge'],
    legacyDeps: ['lerna@3.13.4'],
    shouldES6Utils: true,
  },
  '14': {
    ignoredPackages: ['@sentry/sveltekit', '@sentry/vercel-edge'],
    legacyDeps: [],
    shouldES6Utils: false,
  },
  '16': {
    ignoredPackages: ['@sentry/vercel-edge'],
    legacyDeps: [],
    shouldES6Utils: false,
  },
};

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
export function modifyJSONFile<T extends JSONObject>(filepath: string, transformer: (json: T) => T): void {
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
  const transformer = (tsconfig: TSConfigJSON): TSConfigJSON => {
    tsconfig.compilerOptions.target = 'es6';
    return tsconfig;
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

  DEFAULT_SKIP_TESTS_PACKAGES.forEach(pkg => ignores.add(pkg));

  if (CURRENT_NODE_VERSION === '8') {
    skipNodeV8Tests();
  }

  const versionConfig = SKIP_TEST_PACKAGES[CURRENT_NODE_VERSION as NodeVersions];
  if (versionConfig) {
    versionConfig.ignoredPackages.forEach(dep => ignores.add(dep));
    installLegacyDeps(versionConfig.legacyDeps);
    if (versionConfig.shouldES6Utils) {
      es6ifyTestTSConfig('utils');
    }
  }

  runWithIgnores(Array.from(ignores));
}

runTests();
