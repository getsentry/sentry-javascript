/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '../..');

const TEST_REGISTRY_CONTAINER_NAME = 'verdaccio-e2e-test-registry';
const VERDACCIO_VERSION = '5.15.3';

const PUBLISH_PACKAGES_DOCKER_IMAGE_NAME = 'publish-packages';

const publishScriptNodeVersion = process.env.E2E_TEST_PUBLISH_SCRIPT_NODE_VERSION;

// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#grouping-log-lines
function groupCIOutput(groupTitle: string, fn: () => void): void {
  if (process.env.CI) {
    console.log(`::group::{${groupTitle}}`);
    fn();
    console.log('::endgroup::');
  } else {
    fn();
  }
}

groupCIOutput('Test Registry Setup', () => {
  try {
    // Stop test registry container (Verdaccio) if it was already running
    childProcess.execSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { stdio: 'ignore' });
    console.log('Stopped previously running test registry');
  } catch (e) {
    // Don't throw if container wasn't running
  }

  // Start test registry (Verdaccio)
  childProcess.execSync(
    `docker run --detach --rm --name ${TEST_REGISTRY_CONTAINER_NAME} -p 4873:4873 -v ${__dirname}/verdaccio-config:/verdaccio/conf verdaccio/verdaccio:${VERDACCIO_VERSION}`,
    { encoding: 'utf8', stdio: 'inherit' },
  );

  // Build container image that is uploading our packages to fake registry with specific Node.js/npm version
  childProcess.execSync(
    `docker build --tag ${PUBLISH_PACKAGES_DOCKER_IMAGE_NAME} --file ./Dockerfile.publish-packages ${
      publishScriptNodeVersion ? `--build-arg NODE_VERSION=${publishScriptNodeVersion}` : ''
    } .`,
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );

  // Run container that uploads our packages to fake registry
  childProcess.execSync(
    `docker run --rm -v ${repositoryRoot}:/sentry-javascript --network host ${PUBLISH_PACKAGES_DOCKER_IMAGE_NAME}`,
    {
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
});

groupCIOutput('Run E2E Test Suites', () => {
  // TODO: Run e2e tests here
});

groupCIOutput('Cleanup', () => {
  // Stop test registry
  childProcess.execSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { encoding: 'utf8', stdio: 'ignore' });
  console.log('Successfully stopped test registry container'); // Output from command above is not good so we `ignore` it and emit our own
});
