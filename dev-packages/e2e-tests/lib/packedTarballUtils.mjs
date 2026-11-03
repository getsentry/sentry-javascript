// @ts-check
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_TESTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(E2E_TESTS_ROOT, '../..');

// test-utils is not published, but test apps install it from its tarball too: with a `link:`, its dependencies would
// resolve from the monorepo's root `node_modules` instead of the app's.
const TARBALL_PACKAGE_DIRS = [
  ...fs.readdirSync(path.join(REPOSITORY_ROOT, 'packages')).map(dir => path.join(REPOSITORY_ROOT, 'packages', dir)),
  path.join(REPOSITORY_ROOT, 'dev-packages', 'test-utils'),
];

/**
 * Workspace @sentry and @sentry-internal packages that have a built tarball for the E2E version.
 * @returns {{ name: string; tarballPath: string }[]} The package names and their tarball paths, sorted by name.
 */
export function getPackedTarballs() {
  const version = getE2eTestsPackageVersion();
  const tarballs = [];

  for (const packageDir of TARBALL_PACKAGE_DIRS) {
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const name = readJson(packageJsonPath).name;
    if (!name || (!name.startsWith('@sentry/') && !name.startsWith('@sentry-internal/'))) {
      continue;
    }

    const tarballPath = path.join(packageDir, versionedTarballFilename(name, version));
    if (fs.existsSync(tarballPath)) {
      tarballs.push({ name, tarballPath });
    }
  }

  return tarballs.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Stable symlink name in `packed/` (no version segment).
 * @param {string} packageName
 * @returns {string}
 */
export function packedSymlinkFilename(packageName) {
  return `${npmPackBasename(packageName)}-packed.tgz`;
}

/**
 * Versioned tarball filename produced by `npm pack` in a package directory.
 * @param {string} packageName
 * @param {string} version
 * @returns {string}
 */
function versionedTarballFilename(packageName, version) {
  return `${npmPackBasename(packageName)}-${version}.tgz`;
}

/**
 * npm pack tarball basename (without version and .tgz), e.g. `@sentry/core` -> `sentry-core`.
 * @param {string} packageName
 * @returns {string}
 */
function npmPackBasename(packageName) {
  return packageName.replace(/^@/, '').replace(/\//g, '-');
}

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** @returns {string} */
export function getE2eTestsPackageVersion() {
  return readJson(path.join(E2E_TESTS_ROOT, 'package.json')).version;
}
