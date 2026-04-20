import * as path from 'path';
import * as fs from 'fs';
import { sync as globSync } from 'glob';

const E2E_TESTS_ROOT = path.resolve(__dirname, '..');
const REPOSITORY_ROOT = path.resolve(E2E_TESTS_ROOT, '../..');

/**
 * Workspace @sentry and @sentry-internal packages that have a built tarball for the E2E version.
 * @returns The names of the published Sentry tarball packages.
 */
export function getPublishedSentryTarballPackageNames(): string[] {
  const version = getE2eTestsPackageVersion();
  const names: string[] = [];

  for (const packageJsonPath of globSync('packages/*/package.json', {
    cwd: REPOSITORY_ROOT,
    absolute: true,
  })) {
    const pkg = readJson<{ name?: string }>(packageJsonPath);
    const name = pkg.name;
    if (!name || (!name.startsWith('@sentry/') && !name.startsWith('@sentry-internal/'))) {
      continue;
    }
    const packageDir = path.dirname(packageJsonPath);
    const tarball = path.join(packageDir, versionedTarballFilename(name, version));
    if (fs.existsSync(tarball)) {
      names.push(name);
    }
  }

  return names.sort();
}

/** Stable symlink name in `packed/` (no version segment). */
export function packedSymlinkFilename(packageName: string): string {
  return `${npmPackBasename(packageName)}-packed.tgz`;
}

/**
 * Versioned tarball filename produced by `npm pack` in a package directory.
 */
export function versionedTarballFilename(packageName: string, version: string): string {
  return `${npmPackBasename(packageName)}-${version}.tgz`;
}

/**
 * npm pack tarball basename (without version and .tgz), e.g. `@sentry/core` -> `sentry-core`.
 */
function npmPackBasename(packageName: string): string {
  return packageName.replace(/^@/, '').replace(/\//g, '-');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function getE2eTestsPackageVersion(): string {
  return readJson<{ version: string }>(path.join(E2E_TESTS_ROOT, 'package.json')).version;
}
