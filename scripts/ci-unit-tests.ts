import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type NodeVersion = '14' | '16' | '18' | '20' | '21';

interface VersionConfig {
  ignoredPackages: Array<`@${'sentry' | 'sentry-internal'}/${string}`>;
}

const UNIT_TEST_ENV = process.env.UNIT_TEST_ENV as 'node' | 'browser' | undefined;

const CURRENT_NODE_VERSION = process.version.replace('v', '').split('.')[0] as NodeVersion;

const RUN_AFFECTED = process.argv.includes('--affected');

// These packages are tested separately in CI, so no need to run them here
const DEFAULT_SKIP_PACKAGES = ['@sentry/profiling-node', '@sentry/bun', '@sentry/deno'];

// All other packages are run for multiple node versions
const BROWSER_TEST_PACKAGES = [
  '@sentry/ember',
  '@sentry/browser',
  '@sentry/vue',
  '@sentry/react',
  '@sentry/angular',
  '@sentry/solid',
  '@sentry/svelte',
  '@sentry/profiling-node',
  '@sentry-internal/browser-utils',
  '@sentry-internal/replay',
  '@sentry-internal/replay-canvas',
  '@sentry-internal/replay-worker',
  '@sentry-internal/feedback',
  '@sentry/wasm',
];

// These are Node-version specific tests that need to be skipped because of support
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
      '@sentry-internal/eslint-plugin-sdk',
      '@sentry-internal/nitro-utils',
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

function getAllPackages(): string[] {
  const { workspaces }: { workspaces: string[] } = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
  );

  return workspaces.map(workspacePath => {
    const { name }: { name: string } = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), workspacePath, 'package.json'), 'utf-8'),
    );
    return name;
  });
}

/**
 * Run the tests, accounting for compatibility problems in older versions of Node.
 */
function runTests(): void {
  const ignores = new Set<string>(DEFAULT_SKIP_PACKAGES);

  const packages = getAllPackages();

  if (UNIT_TEST_ENV === 'browser') {
    // Since we cannot "include" for affected mode, we instead exclude all other packages
    packages.forEach(pkg => {
      if (!BROWSER_TEST_PACKAGES.includes(pkg)) {
        ignores.add(pkg);
      }
    });
  } else if (UNIT_TEST_ENV === 'node') {
    BROWSER_TEST_PACKAGES.forEach(pkg => ignores.add(pkg));
  }

  const versionConfig = SKIP_TEST_PACKAGES[CURRENT_NODE_VERSION];
  if (versionConfig) {
    versionConfig.ignoredPackages.forEach(dep => ignores.add(dep));
  }

  if (RUN_AFFECTED) {
    runAffectedTests(ignores);
  } else {
    runAllTests(ignores);
  }
}

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
function runAllTests(ignorePackages: Set<string>): void {
  const ignoreFlags = Array.from(ignorePackages)
    .map(dep => `--ignore="${dep}"`)
    .join(' ');

  run(`yarn test ${ignoreFlags}`);
}

/**
 * Run affected tests, ignoring the given packages
 */
function runAffectedTests(ignorePackages: Set<string>): void {
  const additionalArgs = process.argv
    .slice(2)
    .filter(arg => arg !== '--affected')
    .join(' ');

  const excludeFlags = Array.from(ignorePackages)
    .map(dep => `--exclude="${dep}"`)
    .join(' ');

  run(`yarn test:pr ${excludeFlags} ${additionalArgs}`);
}

runTests();
