/* eslint-disable no-console */
import * as childProcess from 'child_process';
import { readFileSync } from 'fs';
import { globSync } from 'glob';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '../../..');

/**
 * Publishes all built Sentry package tarballs to the local Verdaccio test registry.
 */
export function publishPackages(): void {
  const version = (
    JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8')) as { version: string }
  ).version;

  // Get absolute paths of all the packages we want to publish to the fake registry
  // Only include the current versions, to avoid getting old tarballs published as well
  const packageTarballPaths = globSync(`packages/*/sentry-*-${version}.tgz`, {
    cwd: repositoryRoot,
    absolute: true,
  });

  if (packageTarballPaths.length === 0) {
    throw new Error(`No packages to publish for version ${version}, did you run "yarn build:tarballs"?`);
  }

  const npmrc = path.join(__dirname, '../test-registry.npmrc');

  for (const tarballPath of packageTarballPaths) {
    console.log(`Publishing tarball ${tarballPath} ...`);
    const result = childProcess.spawnSync('npm', ['--userconfig', npmrc, 'publish', tarballPath], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      throw new Error(`Error publishing tarball ${tarballPath}`);
    }
  }
}
