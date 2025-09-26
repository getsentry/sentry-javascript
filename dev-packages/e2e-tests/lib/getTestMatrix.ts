import { execSync } from 'child_process';
import * as fs from 'fs';
import { sync as globSync } from 'glob';
import * as path from 'path';
import { dirname } from 'path';
import { parseArgs } from 'util';

interface MatrixInclude {
  /** The test application (directory) name. */
  'test-application': string;
  /** Optional override for the build command to run. */
  'build-command'?: string;
  /** Optional override for the assert command to run. */
  'assert-command'?: string;
  /** Optional label for the test run. If not set, defaults to value of `test-application`. */
  label?: string;
}

interface PackageJsonSentryTestConfig {
  /** If this is true, the test app is optional. */
  optional?: boolean;
  /** Variant configs that should be run in non-optional test runs. */
  variants?: Partial<MatrixInclude>[];
  /** Variant configs that should be run in optional test runs. */
  optionalVariants?: Partial<MatrixInclude>[];
  /** Skip this test app for matrix generation. */
  skip?: boolean;
}

/**
 * This methods generates a matrix for the GitHub Actions workflow to run the E2E tests.
 * It checks which test applications are affected by the current changes in the PR and then generates a matrix
 * including all test apps that have at least one dependency that was changed in the PR.
 * If no `--base=xxx` is provided, it will output all test applications.
 *
 * If `--optional=true` is set, it will generate a matrix of optional test applications only.
 * Otherwise, these will be skipped.
 */
function run(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      optional: { type: 'string', default: 'false' },
    },
  });

  const { base, head = 'HEAD', optional } = values;

  // For GitHub Action debugging
  // eslint-disable-next-line no-console
  console.error(`Parsed command line arguments: base=${base}, head=${head}, optional=${optional}`);

  const testApplications = globSync('*/package.json', {
    cwd: `${__dirname}/../test-applications`,
  }).map(filePath => dirname(filePath));

  // For GitHub Action debugging (using stderr the 'matrix=...' output is not polluted)
  // eslint-disable-next-line no-console
  console.error(`Discovered ${testApplications.length} test applications: ${testApplications.join(', ')}`);

  // If `--base=xxx` is defined, we only want to get test applications changed since that base
  // Else, we take all test applications (e.g. on push)
  const includedTestApplications = base
    ? getAffectedTestApplications(testApplications, { base, head })
    : testApplications;

  const optionalMode = optional === 'true';
  const includes: MatrixInclude[] = [];

  includedTestApplications.forEach(testApp => {
    addIncludesForTestApp(testApp, includes, { optionalMode });
  });

  // We print this to the output, so the GHA can use it for the matrix
  // eslint-disable-next-line no-console
  console.log(`matrix=${JSON.stringify({ include: includes })}`);
}

function addIncludesForTestApp(
  testApp: string,
  includes: MatrixInclude[],
  { optionalMode }: { optionalMode: boolean },
): void {
  const packageJson = getPackageJson(testApp);

  const shouldSkip = packageJson.sentryTest?.skip || false;
  const isOptional = packageJson.sentryTest?.optional || false;
  const variants = (optionalMode ? packageJson.sentryTest?.optionalVariants : packageJson.sentryTest?.variants) || [];

  if (shouldSkip) {
    return;
  }

  // Add the basic test-application itself, if it is in the current mode
  if (optionalMode === isOptional) {
    includes.push({
      'test-application': testApp,
    });
  }

  variants.forEach(variant => {
    includes.push({
      'test-application': testApp,
      ...variant,
    });
  });
}

function getSentryDependencies(appName: string): string[] {
  const packageJson = getPackageJson(appName);

  const dependencies = {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };

  return Object.keys(dependencies).filter(key => key.startsWith('@sentry'));
}

function getPackageJson(appName: string): {
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
  sentryTest?: PackageJsonSentryTestConfig;
} {
  const fullPath = path.resolve(__dirname, '..', 'test-applications', appName, 'package.json');

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Could not find package.json for ${appName}`);
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

run();

function getAffectedTestApplications(
  testApplications: string[],
  { base = 'develop', head }: { base?: string; head?: string },
): string[] {
  const additionalArgs = [`--base=${base}`];

  if (head) {
    additionalArgs.push(`--head=${head}`);
  }

  let affectedProjects: string[] = [];
  try {
    affectedProjects = execSync(`yarn --silent nx show projects --affected ${additionalArgs.join(' ')}`)
      .toString()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to compute affected projects via Nx. Running all tests instead.', error);
    return testApplications;
  }

  // For GitHub Action debugging
  // eslint-disable-next-line no-console
  console.error(`Nx affected projects (${affectedProjects.length}): ${JSON.stringify(affectedProjects)}`);

  // Run all test apps that have affected projects as dependencies
  const testAppsToRun = new Set(
    testApplications.filter(testApp => {
      const sentryDependencies = getSentryDependencies(testApp);
      return sentryDependencies.some(dep => affectedProjects.includes(dep));
    }),
  );

  // If something in e2e tests themselves are changed, add changed test applications as well
  if (affectedProjects.includes('@sentry-internal/e2e-tests')) {
    try {
      const changedTestApps = getChangedTestApps(base, head);

      if (changedTestApps === false) {
        // Shared code was changed, run all tests
        // eslint-disable-next-line no-console
        console.error('Shared e2e code changed. Running all test applications.');
        testApplications.forEach(testApp => testAppsToRun.add(testApp));
      } else if (changedTestApps.size > 0) {
        // Only test applications that were changed, run selectively
        // eslint-disable-next-line no-console
        console.error(
          `Only changed test applications will run (${changedTestApps.size}): ${JSON.stringify(Array.from(changedTestApps))}`,
        );
        testApplications.forEach(testApp => {
          if (changedTestApps.has(testApp)) {
            testAppsToRun.add(testApp);
          }
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get changed files:', error);
    }
  }

  return Array.from(testAppsToRun);
}

function getChangedTestApps(base: string, head?: string): false | Set<string> {
  const changedFiles = execSync(`git diff --name-only ${base}${head ? `..${head}` : ''} -- .`, {
    encoding: 'utf-8',
  })
    .toString()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  // For GitHub Action debugging
  // eslint-disable-next-line no-console
  console.error(`Changed files since ${base}${head ? `..${head}` : ''}: ${JSON.stringify(changedFiles)}`);

  const changedTestApps: Set<string> = new Set();
  const testAppsPrefix = 'dev-packages/e2e-tests/test-applications/';

  for (const file of changedFiles) {
    if (!file.startsWith(testAppsPrefix)) {
      // Shared code change - need to run all tests
      return false;
    }

    const pathAfterPrefix = file.slice(testAppsPrefix.length);
    const slashIndex = pathAfterPrefix.indexOf('/');

    if (slashIndex > 0) {
      changedTestApps.add(pathAfterPrefix.slice(0, slashIndex));
    }
  }

  return changedTestApps;
}
