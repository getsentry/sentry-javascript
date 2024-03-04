import * as childProcess from 'child_process';

type NodeVersion = '14' | '16' | '18' | '20' | '21';

interface VersionConfig {
  ignoredPackages: Array<`@${'sentry' | 'sentry-internal'}/${string}`>;
}

const CURRENT_NODE_VERSION = process.version.replace('v', '').split('.')[0] as NodeVersion;

const DEFAULT_SKIP_TESTS_PACKAGES = [
  '@sentry-internal/eslint-plugin-sdk',
  '@sentry/ember',
  '@sentry/browser',
  '@sentry/vue',
  '@sentry/react',
  '@sentry/angular',
  '@sentry/svelte',
  '@sentry/profiling-node',
  '@sentry/replay',
  '@sentry-internal/replay-canvas',
  '@sentry-internal/replay-worker',
  '@sentry-internal/feedback',
  '@sentry/wasm',
  '@sentry/bun',
  '@sentry/deno',
];

const SKIP_TEST_PACKAGES: Record<NodeVersion, VersionConfig> = {
  '14': {
    ignoredPackages: ['@sentry/sveltekit', '@sentry/vercel-edge', '@sentry/astro'],
  },
  '16': {
    ignoredPackages: ['@sentry/vercel-edge', '@sentry/astro'],
  },
  '18': {
    ignoredPackages: [],
  },
  '20': {
    ignoredPackages: [],
  },
  '21': {
    ignoredPackages: [],
  },
};

/**
 * Run the given shell command, piping the shell process's `stdin`, `stdout`, and `stderr` to that of the current
 * process. Returns contents of `stdout`.
 */
function run(cmd: string, options?: childProcess.ExecSyncOptions): void {
  childProcess.execSync(cmd, { stdio: 'inherit', ...options });
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

  const versionConfig = SKIP_TEST_PACKAGES[CURRENT_NODE_VERSION];
  if (versionConfig) {
    versionConfig.ignoredPackages.forEach(dep => ignores.add(dep));
  }

  runWithIgnores(Array.from(ignores));
}

runTests();
