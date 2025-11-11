import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const UNIT_TEST_ENV = process.env.UNIT_TEST_ENV as 'node' | 'browser' | undefined;
const RUN_AFFECTED = process.argv.includes('--affected');
const NODE_VERSION = process.env.NODE_VERSION as '18' | '20' | '22' | '24';

// These packages are tested separately in CI, so no need to run them here
const DEFAULT_SKIP_PACKAGES = ['@sentry/bun', '@sentry/deno'];

// All other packages are run for multiple node versions
const BROWSER_TEST_PACKAGES = [
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
  '@sentry-internal/bundler-tests',
  '@sentry/wasm',
];

// Packages that cannot run in Node 18
const SKIP_NODE_18_PACKAGES = ['@sentry/react-router'];

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

    if (NODE_VERSION === '18') {
      SKIP_NODE_18_PACKAGES.forEach(pkg => ignores.add(pkg));
    }
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
