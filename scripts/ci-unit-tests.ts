import * as childProcess from 'child_process';
import * as packageJson from './../package.json';

type NodeVersion = '14' | '16' | '18' | '20' | '21';

interface VersionConfig {
  ignoredPackages: Array<`@${'sentry' | 'sentry-internal'}/${string}`>;
}

const CURRENT_NODE_VERSION = extractMajorFromVersion(process.version);

const RUN_AFFECTED = process.argv.includes('--affected');

const DEFAULT_NODE_VERSION = extractMajorFromVersion((packageJson as { volta: { node: string } }).volta.node);

// These packages are tested separately on CI
const DEFAULT_SKIP_TEST_PACKAGES = ['@sentry/bun', '@sentry/deno', '@sentry/profiling-node'];

// These packages only need to be run in the default node version, not all of them
const DEFAULT_NODE_ONLY_TEST_PACKAGES = [
  '@sentry-internal/eslint-plugin-sdk',
  '@sentry/ember',
  '@sentry/browser',
  '@sentry/vue',
  '@sentry/react',
  '@sentry/angular',
  '@sentry/solid',
  '@sentry/svelte',
  '@sentry-internal/browser-utils',
  '@sentry-internal/replay',
  '@sentry-internal/replay-canvas',
  '@sentry-internal/replay-worker',
  '@sentry-internal/feedback',
  '@sentry/wasm',
];

const SKIP_TEST_PACKAGES: Record<NodeVersion, VersionConfig> = {
  '14': {
    ignoredPackages: [
      '@sentry/cloudflare',
      '@sentry/solidstart',
      '@sentry/sveltekit',
      '@sentry/vercel-edge',
      '@sentry/astro',
      '@sentry/nuxt',
      '@sentry/nestjs',
    ],
  },
  '16': {
    ignoredPackages: ['@sentry/cloudflare', '@sentry/vercel-edge', '@sentry/astro', '@sentry/solidstart'],
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
 * Run affected tests, ignoring the given packages
 */
function runAffectedWithIgnores(skipPackages: string[] = []): void {
  const additionalArgs = process.argv
    .slice(2)
    // We only want to forward the --base=xxx argument
    .filter(arg => arg.startsWith('--base'))
    .join(' ');
  const ignoreFlags = skipPackages.map(dep => `--exclude="${dep}"`).join(' ');
  run(`yarn test:affected ${ignoreFlags} ${additionalArgs}`);
}

/**
 * Run the tests, accounting for compatibility problems in older versions of Node.
 */
function runTests(): void {
  const ignores = new Set<string>(DEFAULT_SKIP_TEST_PACKAGES);

  if (CURRENT_NODE_VERSION !== DEFAULT_NODE_VERSION) {
    DEFAULT_NODE_ONLY_TEST_PACKAGES.forEach(pkg => ignores.add(pkg));
  }

  const versionConfig = SKIP_TEST_PACKAGES[CURRENT_NODE_VERSION];
  if (versionConfig) {
    versionConfig.ignoredPackages.forEach(dep => ignores.add(dep));
  }

  if (RUN_AFFECTED) {
    runAffectedWithIgnores(Array.from(ignores));
  } else {
    runWithIgnores(Array.from(ignores));
  }
}

runTests();

function extractMajorFromVersion(version: string): NodeVersion {
  return version.replace('v', '').split('.')[0] as NodeVersion;
}
