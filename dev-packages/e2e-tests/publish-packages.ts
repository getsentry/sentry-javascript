import * as childProcess from 'child_process';
import { readFileSync } from 'fs';
import * as glob from 'glob';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '../..');

const version = (JSON.parse(readFileSync(path.join(__dirname, './package.json'), 'utf8')) as { version: string })
  .version;

// Get absolute paths of all the packages we want to publish to the fake registry
// Only include the current versions, to avoid getting old tarballs published as well
const packageTarballPaths = glob.sync(`packages/*/sentry-*-${version}.tgz`, {
  cwd: repositoryRoot,
  absolute: true,
});

if (packageTarballPaths.length === 0) {
  // eslint-disable-next-line no-console
  console.log(`No packages to publish for version ${version}, did you run "yarn build:tarballs"?`);
  process.exit(1);
}

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
