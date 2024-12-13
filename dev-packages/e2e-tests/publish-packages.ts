import * as childProcess from 'child_process';
import * as path from 'path';
import * as glob from 'glob';

const repositoryRoot = path.resolve(__dirname, '../..');

// Get absolute paths of all the packages we want to publish to the fake registry
const packageTarballPaths = glob.sync('packages/*/sentry-*.tgz', {
  cwd: repositoryRoot,
  absolute: true,
});

// Publish built packages to the fake registry
packageTarballPaths.forEach(tarballPath => {
  // eslint-disable-next-line no-console
  console.log(`Publishing tarball ${tarballPath} ...`);
  // `--userconfig` flag needs to be before `publish`
  childProcess.exec(
    `npm --userconfig ${__dirname}/test-registry.npmrc publish ${tarballPath}`,
    {
      cwd: repositoryRoot, // Can't use __dirname here because npm would try to publish `@sentry-internal/e2e-tests`
      encoding: 'utf8',
    },
    err => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error(`Error publishing tarball ${tarballPath}`, err);
        process.exit(1);
      }
    },
  );
});
