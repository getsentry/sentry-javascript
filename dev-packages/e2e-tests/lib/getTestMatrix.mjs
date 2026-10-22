import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generates a matrix for the GitHub Actions workflow to run the E2E tests.
 * Checks which test applications are affected by the current changes in the PR and then generates a matrix
 * including all test apps that have at least one dependency that was changed in the PR.
 * If no `--base=xxx` is provided, it will output all test applications.
 *
 * If `--optional=true` is set, it will generate a matrix of optional test applications only.
 * Otherwise, these will be skipped.
 *
 * With `--batch-size=n`, every matrix entry is a job with an `apps` list. Apps on the default runner share a job, n at
 * a time, so the job's setup (checkout, runner start, artifacts, Playwright) is paid once per n apps. An app that sets
 * `sentryTest.runner` gets a job of its own.
 */
function run() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      optional: { type: 'string', default: 'false' },
      'batch-size': { type: 'string' },
    },
  });

  const { base, head = 'HEAD', optional } = values;
  const batchSize = values['batch-size'] ? Number(values['batch-size']) : undefined;
  if (batchSize !== undefined && !(Number.isInteger(batchSize) && batchSize > 0)) {
    throw new Error(`--batch-size must be a positive integer, got ${values['batch-size']}`);
  }

  // For GitHub Action debugging
  // eslint-disable-next-line no-console
  console.error(`Parsed command line arguments: base=${base}, head=${head}, optional=${optional}`);

  const testApplications = discoverTestApplicationDirs();

  // For GitHub Action debugging (using stderr the 'matrix=...' output is not polluted)
  // eslint-disable-next-line no-console
  console.error(`Discovered ${testApplications.length} test applications: ${testApplications.join(', ')}`);

  // If `--base=xxx` is defined, we only want to get test applications changed since that base
  // Else, we take all test applications (e.g. on push)
  const includedTestApplications = base
    ? getAffectedTestApplications(testApplications, { base, head })
    : testApplications;

  const optionalMode = optional === 'true';
  const includes = [];

  includedTestApplications.forEach(testApp => {
    addIncludesForTestApp(testApp, includes, { optionalMode });
  });

  // We print this to the output, so the GHA can use it for the matrix
  // eslint-disable-next-line no-console
  console.log(`matrix=${JSON.stringify({ include: batchSize ? batchIncludes(includes, batchSize) : includes })}`);
}

/**
 * Groups matrix entries into jobs. Each app gets a unique `dir`, the directory it is copied to, so the apps of one job
 * do not share build output and their test results and traces stay apart.
 * A job installs one Playwright version, so apps only share a job with apps that use the same version.
 */
function batchIncludes(includes, batchSize) {
  const usedDirs = new Set();
  const apps = includes.map(include => {
    const label = include.label || include['test-application'];
    const baseDir =
      label
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'app';
    let dir = baseDir;
    for (let i = 2; usedDirs.has(dir); i++) {
      dir = `${baseDir}-${i}`;
    }
    usedDirs.add(dir);
    const { runner: _runner, ...app } = include;
    return { runner: include.runner, app: { ...app, label, dir } };
  });

  const jobs = apps
    .filter(({ runner }) => runner)
    .map(({ runner, app }) => ({ label: app.label, runner, apps: [app] }));

  const sharedByPlaywrightVersion = new Map();
  for (const { runner, app } of apps) {
    if (!runner) {
      const version = getPlaywrightVersion(app['test-application']);
      sharedByPlaywrightVersion.set(version, [...(sharedByPlaywrightVersion.get(version) ?? []), app]);
    }
  }
  for (const shared of sharedByPlaywrightVersion.values()) {
    for (let i = 0; i < shared.length; i += batchSize) {
      const batch = shared.slice(i, i + batchSize);
      jobs.push({ label: batch.map(app => app.label).join(', '), apps: batch });
    }
  }

  assertSameApps(includes, jobs, batchSize);

  return jobs.map(job => {
    const testApplications = job.apps.map(app => app['test-application']);
    return {
      ...job,
      // The app whose package.json `install-playwright` reads the Playwright version from
      'playwright-app': testApplications.find(app => getPlaywrightVersion(app)) ?? testApplications[0],
      'aws-serverless-layer': testApplications.some(app => app.includes('aws-serverless')),
      'aws-serverless-build': testApplications.includes('aws-serverless'),
    };
  });
}

/**
 * Batching must not drop, duplicate or change a matrix entry, so the jobs run exactly the apps and variants of the
 * unbatched matrix. Fails the matrix step instead of silently running fewer tests.
 */
function assertSameApps(includes, jobs, batchSize) {
  const withoutBatchFields = ({ label: _label, dir: _dir, ...app }) => app;
  const key = include => {
    const { runner: _runner, ...app } = include;
    return JSON.stringify(withoutBatchFields(app), Object.keys(withoutBatchFields(app)).sort());
  };
  const expected = includes.map(key).sort();
  const actual = jobs.flatMap(job => job.apps.map(key)).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Batching changed the E2E matrix: ${expected.length} entries before, ${actual.length} after`);
  }
  const labels = includes.map(include => include.label || include['test-application']);
  const batchedLabels = jobs.flatMap(job => job.apps.map(app => app.label));
  if (JSON.stringify([...labels].sort()) !== JSON.stringify([...batchedLabels].sort())) {
    throw new Error('Batching changed the labels of the E2E matrix');
  }
  for (const job of jobs) {
    if (job.apps.length > (job.runner ? 1 : batchSize)) {
      throw new Error(`The E2E job ${job.label} has ${job.apps.length} apps`);
    }
  }
}

function getPlaywrightVersion(appName) {
  const { dependencies, devDependencies } = getPackageJson(appName);
  return devDependencies?.['@playwright/test'] ?? dependencies?.['@playwright/test'] ?? '';
}

/** Direct children of `test-applications/` that contain a `package.json` (replaces glob one-segment + package.json). */
function discoverTestApplicationDirs() {
  const appsRoot = path.join(__dirname, '..', 'test-applications');
  return fs
    .readdirSync(appsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => fs.existsSync(path.join(appsRoot, name, 'package.json')))
    .sort();
}

function addIncludesForTestApp(testApp, includes, { optionalMode }) {
  const packageJson = getPackageJson(testApp);

  const shouldSkip = packageJson.sentryTest?.skip || false;
  const isOptional = packageJson.sentryTest?.optional || false;
  const variants = (optionalMode ? packageJson.sentryTest?.optionalVariants : packageJson.sentryTest?.variants) || [];
  const runner = packageJson.sentryTest?.runner;
  const baseInclude = { 'test-application': testApp, ...(runner ? { runner } : {}) };

  if (shouldSkip) {
    return;
  }

  // Add the basic test-application itself, if it is in the current mode
  if (optionalMode === isOptional) {
    includes.push(baseInclude);
  }

  variants.forEach(variant => {
    // Allow skipping an individual variant (e.g. one blocked by an upstream bug) while keeping the
    // others. `sentryTest.skip` above skips the whole app; this is the per-variant equivalent.
    if (variant.skip) {
      return;
    }

    // Don't leak the `skip` flag into the matrix include.
    const { skip: _skip, ...variantConfig } = variant;
    includes.push({
      ...baseInclude,
      ...variantConfig,
    });
  });
}

function getSentryDependencies(appName) {
  const packageJson = getPackageJson(appName);

  const dependencies = {
    ...packageJson.devDependencies,
    ...packageJson.dependencies,
  };

  return Object.keys(dependencies).filter(key => key.startsWith('@sentry'));
}

function getPackageJson(appName) {
  const fullPath = path.resolve(__dirname, '..', 'test-applications', appName, 'package.json');

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Could not find package.json for ${appName}`);
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function getAffectedTestApplications(testApplications, { base = 'develop', head }) {
  const additionalArgs = [`--base=${base}`];

  if (head) {
    additionalArgs.push(`--head=${head}`);
  }

  let affectedProjects = [];
  try {
    affectedProjects = execSync(`pnpm --silent exec nx show projects --affected ${additionalArgs.join(' ')}`)
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

function getChangedTestApps(base, head) {
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

  const changedTestApps = new Set();
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

run();
