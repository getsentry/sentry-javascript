/* eslint-disable no-console */
import * as childProcess from 'child_process';
import * as path from 'path';
import * as glob from 'glob';

const TEST_REGISTRY_CONTAINER_NAME = 'verdaccio-e2e-test-registry';

const repositoryRoot = path.resolve(__dirname, '..');

// Create tarballs
childProcess.execSync('yarn build:npm', { encoding: 'utf8', cwd: repositoryRoot, stdio: 'inherit' });

try {
  // Stop Verdaccio Test Registry container if it was already running
  childProcess.execSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { stdio: 'ignore' });
  console.log('Stopped previously running test registry');
} catch (e) {
  // Don't throw if container wasn't running
}

// Start Verdaccio Test Registry
childProcess.execSync(
  `docker run --detach --rm --name verdaccio-e2e-test-registry -p 4873:4873 -v ${__dirname}/verdaccio/conf:/verdaccio/conf verdaccio/verdaccio:5.15.3`,
  { encoding: 'utf8', stdio: 'inherit' },
);

// Publish built packages to Verdaccio Test Registry
const packageTarballPaths = glob.sync('packages/*/sentry-*.tgz', {
  cwd: repositoryRoot,
  absolute: true,
});
packageTarballPaths.forEach(tarballPath => {
  childProcess.execSync(`npm publish ${tarballPath}`, {
    env: {
      NODE_ENV: 'production',
      NPM_CONFIG_USERCONFIG: `${__dirname}/test-registry.npmrc`,
    },
    encoding: 'utf8',
    stdio: 'inherit',
  });
});

// TODO: Run e2e tests here

// Stop test registry
childProcess.execSync(`docker stop ${TEST_REGISTRY_CONTAINER_NAME}`, { encoding: 'utf8', stdio: 'ignore' });
console.log('Successfully stopped test registry container'); // Output from command above is not good so we ignore it and write our own
