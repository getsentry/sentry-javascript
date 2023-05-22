/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as path from 'path';

import { PUBLISH_PACKAGES_DOCKER_IMAGE_NAME, TEST_REGISTRY_CONTAINER_NAME, VERDACCIO_VERSION } from './lib/constants';

const publishScriptNodeVersion = process.env.E2E_TEST_PUBLISH_SCRIPT_NODE_VERSION;
const repositoryRoot = path.resolve(__dirname, '../..');

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

export default function registrySetup(): void {
  groupCIOutput('E2E Test Setup', () => {
    console.log('Stopping previously running test registry...');
    // Stop test registry container (Verdaccio) if it was already running
    childProcess.spawnSync('docker', ['stop', TEST_REGISTRY_CONTAINER_NAME], { stdio: 'ignore' });

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
      throw new Error('Start Registry Process failed.');
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
      throw new Error('Build Publish Image failed.');
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
      throw new Error('Publish Image Container failed.');
    }
  });
}
