import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { sync as globSync } from 'glob';

interface MatrixInclude {
  'test-application': string;
  'build-command'?: string;
  'assert-command'?: string;
  label?: string;
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
  const args: Record<string, string> = {};
  process.argv
    .slice(2)
    .filter(arg => arg.startsWith('--') && arg.includes('='))
    .forEach(arg => {
      const [part1, part2] = arg.split('=') as [string, string];
      const argName = part1.replace('--', '');
      const argValue = part2;
      args[argName] = argValue;
    });

  const { base, head, optional = 'false' } = args;

  const testApplications = globSync('*', { cwd: `${__dirname}/../test-applications/` });

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

  // this means something went wrong
  if (!packageJson) {
    return;
  }

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
  const packageJson = getPackageJson(appName) || {};

  const dependencies = {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };

  return Object.keys(dependencies).filter(key => key.startsWith('@sentry'));
}

function getPackageJson(appName: string):
  | {
      dependencies?: { [key: string]: string };
      devDependencies?: { [key: string]: string };
      sentryTest?: {
        optional?: boolean;
        variants?: Partial<MatrixInclude>[];
        optionalVariants?: Partial<MatrixInclude>[];
        skip?: boolean;
      };
    }
  | undefined {
  const fullPath = path.resolve(__dirname, '..', 'test-applications', appName, 'package.json');

  // This can happen if you e.g. have a leftover directory in test-applications
  if (!fs.existsSync(fullPath)) {
    return undefined;
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

  const affectedProjects = execSync(`yarn --silent nx show projects --affected ${additionalArgs.join(' ')}`)
    .toString()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  // If something in e2e tests themselves are changed, just run everything
  if (affectedProjects.includes('@sentry-internal/e2e-tests')) {
    return testApplications;
  }

  return testApplications.filter(testApp => {
    const sentryDependencies = getSentryDependencies(testApp);
    return sentryDependencies.some(dep => affectedProjects.includes(dep));
  });
}
