/* eslint-disable max-lines */
/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';

// Load environment variables from .env file locally
dotenv.config();

const repositoryRoot = path.resolve(__dirname, '../..');

const TEST_REGISTRY_CONTAINER_NAME = 'verdaccio-e2e-test-registry';
const VERDACCIO_VERSION = '5.15.3';

const PUBLISH_PACKAGES_DOCKER_IMAGE_NAME = 'publish-packages';

const publishScriptNodeVersion = process.env.E2E_TEST_PUBLISH_SCRIPT_NODE_VERSION;

const DEFAULT_BUILD_TIMEOUT_SECONDS = 60 * 5;
const DEFAULT_TEST_TIMEOUT_SECONDS = 60 * 2;

let missingEnvVar = false;

if (!process.env.E2E_TEST_AUTH_TOKEN) {
  console.log(
    "No auth token configured! Please configure the E2E_TEST_AUTH_TOKEN environment variable with an auth token that has the scope 'project:read'!",
  );
  missingEnvVar = true;
}

if (!process.env.E2E_TEST_DSN) {
  console.log('No DSN configured! Please configure the E2E_TEST_DSN environment variable with a DSN!');
  missingEnvVar = true;
}

if (!process.env.E2E_TEST_SENTRY_ORG_SLUG) {
  console.log(
    'No Sentry organization slug configured! Please configure the E2E_TEST_SENTRY_ORG_SLUG environment variable with a Sentry organization slug!',
  );
  missingEnvVar = true;
}

if (!process.env.E2E_TEST_SENTRY_TEST_PROJECT) {
  console.log(
    'No Sentry project configured! Please configure the E2E_TEST_SENTRY_TEST_PROJECT environment variable with a Sentry project slug!',
  );
  missingEnvVar = true;
}

if (missingEnvVar) {
  process.exit(1);
}

const envVarsToInject = {
  REACT_APP_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
  NEXT_PUBLIC_E2E_TEST_DSN: process.env.E2E_TEST_DSN,
  // Below are required for sentry-cli to work
  SENTRY_ORG: process.env.E2E_TEST_SENTRY_ORG_SLUG,
  SENTRY_PROJECT: process.env.E2E_TEST_SENTRY_TEST_PROJECT,
  SENTRY_AUTH_TOKEN: process.env.E2E_TEST_AUTH_TOKEN,
};

// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#grouping-log-lines
function groupCIOutput(groupTitle: string, fn: () => void): void {
  if (process.env.CI) {
    console.log(`::group::${groupTitle}`);
    fn();
    console.log('::endgroup::');
  } else {
    fn();
  }
}

// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-error-message
function printCIErrorMessage(message: string): void {
  if (process.env.CI) {
    console.log(`::error::${message}`);
  } else {
    console.log(message);
  }
}

groupCIOutput('Test Registry Setup', () => {
  // Stop test registry container (Verdaccio) if it was already running
  childProcess.spawnSync('docker', ['stop', TEST_REGISTRY_CONTAINER_NAME], { stdio: 'ignore' });
  console.log('Stopped previously running test registry');

  // Start test registry (Verdaccio)
  const startRegistryProcessResult = childProcess.spawnSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      TEST_REGISTRY_CONTAINER_NAME,
      '-p',
      '4873:4873',
      '-v',
      `${__dirname}/verdaccio-config:/verdaccio/conf`,
      `verdaccio/verdaccio:${VERDACCIO_VERSION}`,
    ],
    { encoding: 'utf8', stdio: 'inherit' },
  );

  if (startRegistryProcessResult.status !== 0) {
    process.exit(1);
  }

  // Build container image that is uploading our packages to fake registry with specific Node.js/npm version
  const buildPublishImageProcessResult = childProcess.spawnSync(
    'docker',
    [
      'build',
      '--tag',
      PUBLISH_PACKAGES_DOCKER_IMAGE_NAME,
      '--file',
      './Dockerfile.publish-packages',
      ...(publishScriptNodeVersion ? ['--build-arg', `NODE_VERSION=${publishScriptNodeVersion}`] : []),
      '.',
    ],
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  if (buildPublishImageProcessResult.status !== 0) {
    process.exit(1);
  }

  // Run container that uploads our packages to fake registry
  const publishImageContainerRunProcess = childProcess.spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${repositoryRoot}:/sentry-javascript`,
      '--network',
      'host',
      PUBLISH_PACKAGES_DOCKER_IMAGE_NAME,
    ],
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  if (publishImageContainerRunProcess.status !== 0) {
    process.exit(1);
  }
});

const recipePaths = glob.sync(`${__dirname}/test-applications/*/test-recipe.json`, { absolute: true });

let processShouldExitWithError = false;

type TestResult = {
  testName: string;
  result: 'PASS' | 'FAIL' | 'TIMEOUT';
};

type VersionResult = {
  dependencyOverrides?: Record<string, string>;
  buildFailed: boolean;
  testResults: TestResult[];
};

type RecipeResult = {
  testApplicationName: string;
  testApplicationPath: string;
  versionResults: VersionResult[];
};

type Recipe = {
  testApplicationName: string;
  buildCommand?: string;
  buildTimeoutSeconds?: number;
  tests: {
    testName: string;
    testCommand: string;
    timeoutSeconds?: number;
  }[];
  versions?: { dependencyOverrides: Record<string, string> }[];
  canaryVersions?: { dependencyOverrides: Record<string, string> }[];
};

const recipeResults: RecipeResult[] = recipePaths.map(recipePath => {
  const recipe: Recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));
  const recipeDirname = path.dirname(recipePath);

  function runRecipe(dependencyOverrides: Record<string, string> | undefined): VersionResult {
    const dependencyOverridesInformationString = dependencyOverrides
      ? ` (Dependency overrides: ${JSON.stringify(dependencyOverrides)})`
      : '';

    if (recipe.buildCommand) {
      console.log(
        `Running E2E test build command for test application "${recipe.testApplicationName}"${dependencyOverridesInformationString}`,
      );
      const buildCommandProcess = childProcess.spawnSync(recipe.buildCommand, {
        cwd: path.dirname(recipePath),
        encoding: 'utf8',
        shell: true, // needed so we can pass the build command in as whole without splitting it up into args
        timeout: (recipe.buildTimeoutSeconds ?? DEFAULT_BUILD_TIMEOUT_SECONDS) * 1000,
        env: {
          ...process.env,
          ...envVarsToInject,
        },
      });

      // Prepends some text to the output build command's output so we can distinguish it from logging in this script
      console.log(buildCommandProcess.stdout.replace(/^/gm, '[BUILD OUTPUT] '));
      console.log(buildCommandProcess.stderr.replace(/^/gm, '[BUILD OUTPUT] '));

      const error: undefined | (Error & { code?: string }) = buildCommandProcess.error;

      if (error?.code === 'ETIMEDOUT') {
        processShouldExitWithError = true;

        printCIErrorMessage(
          `Build command in test application "${recipe.testApplicationName}" (${path.dirname(recipePath)}) timed out!`,
        );

        return {
          dependencyOverrides,
          buildFailed: true,
          testResults: [],
        };
      } else if (buildCommandProcess.status !== 0) {
        processShouldExitWithError = true;

        printCIErrorMessage(
          `Build command in test application "${recipe.testApplicationName}" (${path.dirname(recipePath)}) failed!`,
        );

        return {
          dependencyOverrides,
          buildFailed: true,
          testResults: [],
        };
      }
    }

    const testResults: TestResult[] = recipe.tests.map(test => {
      console.log(
        `Running E2E test command for test application "${recipe.testApplicationName}", test "${test.testName}"${dependencyOverridesInformationString}`,
      );

      const testProcessResult = childProcess.spawnSync(test.testCommand, {
        cwd: path.dirname(recipePath),
        timeout: (test.timeoutSeconds ?? DEFAULT_TEST_TIMEOUT_SECONDS) * 1000,
        encoding: 'utf8',
        shell: true, // needed so we can pass the test command in as whole without splitting it up into args
        env: {
          ...process.env,
          ...envVarsToInject,
        },
      });

      // Prepends some text to the output test command's output so we can distinguish it from logging in this script
      console.log(testProcessResult.stdout.replace(/^/gm, '[TEST OUTPUT] '));
      console.log(testProcessResult.stderr.replace(/^/gm, '[TEST OUTPUT] '));

      const error: undefined | (Error & { code?: string }) = testProcessResult.error;

      if (error?.code === 'ETIMEDOUT') {
        processShouldExitWithError = true;
        printCIErrorMessage(
          `Test "${test.testName}" in test application "${recipe.testApplicationName}" (${path.dirname(
            recipePath,
          )}) timed out.`,
        );
        return {
          testName: test.testName,
          result: 'TIMEOUT',
        };
      } else if (testProcessResult.status !== 0) {
        processShouldExitWithError = true;
        printCIErrorMessage(
          `Test "${test.testName}" in test application "${recipe.testApplicationName}" (${path.dirname(
            recipePath,
          )}) failed.`,
        );
        return {
          testName: test.testName,
          result: 'FAIL',
        };
      } else {
        console.log(
          `Test "${test.testName}" in test application "${recipe.testApplicationName}" (${path.dirname(
            recipePath,
          )}) succeeded.`,
        );
        return {
          testName: test.testName,
          result: 'PASS',
        };
      }
    });

    return {
      dependencyOverrides,
      buildFailed: false,
      testResults,
    };
  }

  const versionsToRun: {
    dependencyOverrides?: Record<string, string>;
  }[] = process.env.CANARY_E2E_TEST ? recipe.canaryVersions ?? [] : recipe.versions ?? [{}];

  const versionResults = versionsToRun.map(({ dependencyOverrides }) => {
    const packageJsonPath = path.resolve(recipeDirname, 'package.json');
    const packageJsonBackupPath = path.resolve(recipeDirname, 'package.json.bak');

    if (dependencyOverrides) {
      // Back up original package.json
      fs.copyFileSync(packageJsonPath, packageJsonBackupPath);

      // Override dependencies
      const packageJson: { dependencies?: Record<string, string> } = JSON.parse(
        fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }),
      );
      packageJson.dependencies = packageJson.dependencies
        ? { ...packageJson.dependencies, ...dependencyOverrides }
        : dependencyOverrides;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), {
        encoding: 'utf-8',
      });
    }

    try {
      return runRecipe(dependencyOverrides);
    } finally {
      if (dependencyOverrides) {
        // Restore original package.json
        fs.rmSync(packageJsonPath, { force: true });
        fs.copyFileSync(packageJsonBackupPath, packageJsonPath);
        fs.rmSync(packageJsonBackupPath, { force: true });
      }
    }
  });

  return {
    testApplicationName: recipe.testApplicationName,
    testApplicationPath: recipePath,
    versionResults,
  };
});

console.log('--------------------------------------');
console.log('Test Result Summary:');

recipeResults.forEach(recipeResult => {
  recipeResult.versionResults.forEach(versionResult => {
    const dependencyOverridesInformationString = versionResult.dependencyOverrides
      ? ` (Dependency overrides: ${JSON.stringify(versionResult.dependencyOverrides)})`
      : '';

    if (versionResult.buildFailed) {
      console.log(
        `● BUILD FAILED - ${recipeResult.testApplicationName} (${path.dirname(
          recipeResult.testApplicationPath,
        )})${dependencyOverridesInformationString}`,
      );
    } else {
      console.log(
        `● BUILD SUCCEEDED - ${recipeResult.testApplicationName} (${path.dirname(
          recipeResult.testApplicationPath,
        )})${dependencyOverridesInformationString}`,
      );
      versionResult.testResults.forEach(testResult => {
        console.log(`  ● ${testResult.result.padEnd(7, ' ')} ${testResult.testName}`);
      });
    }
  });
});

// Stop test registry
childProcess.spawnSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { encoding: 'utf8', stdio: 'ignore' });
console.log('Successfully stopped test registry container'); // Output from command above is not good so we `ignore` it and emit our own

if (processShouldExitWithError) {
  console.log('Not all tests succeeded.');
  process.exit(1);
} else {
  console.log('All tests succeeded.');
}
