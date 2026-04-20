/* eslint-disable no-console */
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { globSync } from 'glob';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '../../..');

function npmPublish(tarballPath: string, npmrc: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['--userconfig', npmrc, 'publish', tarballPath, '--tag', 'e2e'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Error publishing tarball ${tarballPath}`));
      }
    });
  });
}

/**
 * Publishes all built Sentry package tarballs to the local Verdaccio test registry.
 * Uses async `npm publish` so an in-process Verdaccio can still handle HTTP on the event loop.
 */
export async function publishPackages(): Promise<void> {
  const version = (JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8')) as { version: string })
    .version;

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
    await npmPublish(tarballPath, npmrc);
  }
}
