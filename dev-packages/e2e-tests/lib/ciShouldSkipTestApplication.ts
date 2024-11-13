import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * This logs SKIP=true or SKIP=false,
 * which can be used by GHA to determine if the given test application should be skipped or not.
 * This uses nx to check if any of the sentry dependencies of the test-application have been affected.
 */
function ciShouldSkipTestApplication(): void {
  // Allow to run a single app only via `yarn test:run <app-name>`
  const appName = process.argv[2];

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
  const { base = 'develop', head } = args;

  if (!appName) {
    throw new Error('Please provide the app name as the first argument');
  }

  const fullPath = path.resolve(__dirname, '..', 'test-applications', appName, 'package.json');

  if (!fs.existsSync(fullPath)) {
    throw new Error(`The app ${appName} does not exist`);
  }

  const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
  };

  const dependencies = {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };

  const sentryDependencies = Object.keys(dependencies).filter(key => key.startsWith('@sentry/'));

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
    .map(line => line.trim());

  // If one of the sentry dependencies is affected, this test should be run
  const affected = sentryDependencies.some(dep => affectedProjects.includes(dep));

  // This is used by CI to determine if steps should be skipped or not
  // eslint-disable-next-line no-console
  console.log(`SKIP=${affected ? 'false' : 'true'}`);
}

ciShouldSkipTestApplication();
