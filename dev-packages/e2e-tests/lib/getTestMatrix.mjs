import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GitHub Actions fails a job whose matrix has more jobs than this, and runs none of them.
const MAX_MATRIX_JOBS = 256;

const VARIANT_FIELDS = {
  required: 'variants',
  optional: 'optionalVariants',
  canary: 'canaryVariants',
};

/**
 * Generates a matrix for the GitHub Actions workflow to run the E2E tests.
 * Checks which test applications are affected by the current changes in the PR and then generates a matrix
 * including all test apps that have at least one dependency that was changed in the PR.
 * If no `--base=xxx` is provided, it will output all test applications.
 *
 * `--variant` selects which matrix to generate:
 * - not set: the required test applications and their `variants`
 * - `optional`: the optional test applications and the `optionalVariants` of all test applications
 * - `canary`: only the `canaryVariants` of all test applications
 *
 * `--shards=N` splits the matrix into N parts (`matrix-1=...` to `matrix-N=...`), because GitHub Actions allows at
 * most 256 jobs in one matrix.
 */
function run() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      variant: { type: 'string', default: 'required' },
      shards: { type: 'string' },
    },
  });

  const { base, head = 'HEAD', variant, shards } = values;

  // For GitHub Action debugging
  // eslint-disable-next-line no-console
  console.error(`Parsed command line arguments: base=${base}, head=${head}, variant=${variant}`);

  if (!Object.hasOwn(VARIANT_FIELDS, variant)) {
    throw new Error(`Unknown --variant=${variant}, expected one of: ${Object.keys(VARIANT_FIELDS).join(', ')}`);
  }

  const testApplications = discoverTestApplicationDirs();

  // For GitHub Action debugging (using stderr the 'matrix=...' output is not polluted)
  // eslint-disable-next-line no-console
  console.error(`Discovered ${testApplications.length} test applications: ${testApplications.join(', ')}`);

  // If `--base=xxx` is defined, we only want to get test applications changed since that base
  // Else, we take all test applications (e.g. on push)
  const includedTestApplications = base
    ? getAffectedTestApplications(testApplications, { base, head })
    : testApplications;

  const includes = [];

  includedTestApplications.forEach(testApp => {
    addIncludesForTestApp(testApp, includes, { variant });
  });

  if (!shards) {
    // We print this to the output, so the GHA can use it for the matrix
    // eslint-disable-next-line no-console
    console.log(`matrix=${JSON.stringify({ include: includes })}`);
    return;
  }

  const shardCount = Number(shards);
  const shardSize = Math.ceil(includes.length / shardCount);

  if (shardSize > MAX_MATRIX_JOBS) {
    throw new Error(
      `${includes.length} jobs do not fit into ${shardCount} matrices of at most ${MAX_MATRIX_JOBS} jobs, increase --shards`,
    );
  }

  for (let i = 0; i < shardCount; i++) {
    const shardIncludes = includes.slice(i * shardSize, (i + 1) * shardSize);
    // eslint-disable-next-line no-console
    console.log(`matrix-${i + 1}=${JSON.stringify({ include: shardIncludes })}`);
  }
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

function addIncludesForTestApp(testApp, includes, { variant }) {
  const packageJson = getPackageJson(testApp);

  const shouldSkip = packageJson.sentryTest?.skip || false;
  const isOptional = packageJson.sentryTest?.optional || false;
  const variants = packageJson.sentryTest?.[VARIANT_FIELDS[variant]] || [];
  const runner = packageJson.sentryTest?.runner;
  const baseInclude = { 'test-application': testApp, ...(runner ? { runner } : {}) };

  if (shouldSkip) {
    return;
  }

  // The test application itself is either required or optional, never canary, and only runs in the matrix of its mode.
  const appVariant = isOptional ? 'optional' : 'required';
  if (appVariant === variant) {
    includes.push({ ...baseInclude, ...packageJson.sentryTest?.baseVariant });
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
