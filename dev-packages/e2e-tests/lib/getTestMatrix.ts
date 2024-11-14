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

  // We default to `develop` as base, if none is specified
  // head has a correct default value anyhow
  const { base = 'develop', head, optional = 'false' } = args;

  const testApplications = globSync('*', { cwd: `${__dirname}/../test-applications/` });

  const additionalArgs = [];
  if (base) {
    additionalArgs.push(`--base=${base}`);
  }
  if (head) {
    additionalArgs.push(`--head=${head}`);
  }

  const affectedProjects = execSync(`yarn --silent nx show projects --affected ${additionalArgs.join(' ')}`)
    .toString()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const includedTestApplications = testApplications.filter(testApp => {
    const sentryDependencies = getSentryDependencies(testApp);
    return sentryDependencies.some(dep => affectedProjects.includes(dep));
  });

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
  if (!packageJson.name) {
    return;
  }

  const isOptional = packageJson.sentryTest?.optional || false;
  const variants = (optionalMode ? packageJson.sentryTest?.optionalVariants : packageJson.sentryTest?.variants) || [];

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

  return Object.keys(dependencies).filter(key => key.startsWith('@sentry/'));
}

function getPackageJson(appName: string): {
  name?: string;
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
  sentryTest?: {
    optional?: boolean;
    variants?: Partial<MatrixInclude>[];
    optionalVariants?: Partial<MatrixInclude>[];
  };
} {
  const fullPath = path.resolve(__dirname, '..', 'test-applications', appName, 'package.json');

  // This can happen if you e.g. have a leftover directory in test-applications
  if (!fs.existsSync(fullPath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

run();
