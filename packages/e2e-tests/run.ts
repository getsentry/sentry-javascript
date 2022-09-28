/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '../..');

const TEST_REGISTRY_CONTAINER_NAME = 'verdaccio-e2e-test-registry';
const VERDACCIO_VERSION = '5.15.3';

const PUBLISH_PACKAGES_DOCKER_IMAGE_NAME = 'publish-packages';

const publishScriptNodeVersion = process.env.E2E_TEST_PUBLISH_SCRIPT_NODE_VERSION;

const DEFAULT_TEST_TIMEOUT_SECONDS = 60;

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
      publishScriptNodeVersion ? `--build-arg NODE_VERSION=${publishScriptNodeVersion}` : undefined,
      '.',
    ].filter((arg): arg is string => arg !== undefined),
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

groupCIOutput('Run E2E Test Suites', () => {
  // TODO: Run e2e tests here
  const recipePaths = glob.sync(`${__dirname}/test-applications/*/test-recipe.json`, { absolute: true });

  const recipeResults = recipePaths.map(recipePath => {
    type Recipe = {
      testApplicationName: string;
      buildCommand?: string;
      tests: {
        testName: string;
        testCommand: string;
        timeoutSeconds?: number;
      }[];
    };

    const recipe: Recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));

    if (recipe.buildCommand) {
      console.log(`Running E2E test build command for test application "${recipe.testApplicationName}"`);
      const [buildCommand, ...buildCommandArgs] = recipe.buildCommand.split(' ');
      const buildCommandProcess = childProcess.spawnSync(buildCommand, buildCommandArgs, {
        cwd: path.dirname(recipePath),
        encoding: 'utf8',
        stdio: 'inherit',
      });

      if (buildCommandProcess.status !== 0) {
        process.exit(1);
      }
    }

    type TestResult = {
      testName: string;
      result: 'PASS' | 'FAIL' | 'TIMEOUT';
    };

    const testResults: TestResult[] = recipe.tests.map(test => {
      console.log(
        `Running E2E test command for test application "${recipe.testApplicationName}", test "${test.testName}"`,
      );

      const [testCommand, ...testCommandArgs] = test.testCommand.split(' ');
      const testProcessResult = childProcess.spawnSync(testCommand, testCommandArgs, {
        cwd: path.dirname(recipePath),
        timeout: (test.timeoutSeconds ?? DEFAULT_TEST_TIMEOUT_SECONDS) * 1000,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      console.log(testProcessResult.stdout.replace(/^/gm, '[TEST OUTPUT] '));
      console.log(testProcessResult.stderr.replace(/^/gm, '[TEST OUTPUT] '));

      const error: undefined | (Error & { code?: string }) = testProcessResult.error;

      if (error?.code === 'ETIMEDOUT') {
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
      testApplicationName: recipe.testApplicationName,
      testApplicationPath: recipePath,
      testResults,
    };
  });

  console.log('--------------------------------------');
  console.log('Test Result Summary:');

  recipeResults.forEach(recipeResult => {
    console.log(`● ${recipeResult.testApplicationName} (${path.dirname(recipeResult.testApplicationPath)})`);
    recipeResult.testResults.forEach(testResult => {
      console.log(`  ● ${testResult.result.padEnd(7, ' ')} ${testResult.testName}`);
    });
  });
});

groupCIOutput('Cleanup', () => {
  // Stop test registry
  childProcess.spawnSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { encoding: 'utf8', stdio: 'ignore' });
  console.log('Successfully stopped test registry container'); // Output from command above is not good so we `ignore` it and emit our own
});
