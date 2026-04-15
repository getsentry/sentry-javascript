/* eslint-disable no-console */
import * as childProcess from 'child_process';
import { TEST_REGISTRY_CONTAINER_NAME, VERDACCIO_VERSION } from './lib/constants';

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

export function registrySetup(): void {
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
      throw new Error('Start Registry Process failed.');
    }

    // Publish packages to fake registry
    const publishResult = childProcess.spawnSync('yarn', ['ts-node', 'publish-packages.ts', '--transpile-only'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: 'inherit',
    });

    if (publishResult.status !== 0) {
      throw new Error(`Publishing packages to test registry failed with exit code ${publishResult.status}`);
    }
  });

  console.log('');
  console.log('');
}
