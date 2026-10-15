/* eslint-disable no-console */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every package, including each E2E app, must use this exact version.
// `install-playwright` installs browsers for the declared version, so a drifting app would test against other browsers.
const REFERENCE_PACKAGE_JSON = 'dev-packages/test-utils/package.json';
const PLAYWRIGHT_PACKAGES = ['@playwright/test', 'playwright', 'playwright-core'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const PACKAGE_DIRS = ['packages', 'dev-packages', 'dev-packages/e2e-tests/test-applications'];

const rootDir = join(import.meta.dirname, '..');

/** @param {string} path */
function readPackageJson(path) {
  return JSON.parse(readFileSync(join(rootDir, path), 'utf8'));
}

const expected = readPackageJson(REFERENCE_PACKAGE_JSON).devDependencies['@playwright/test'];

if (!/^\d+\.\d+\.\d+$/.test(expected)) {
  console.error(`@playwright/test in ${REFERENCE_PACKAGE_JSON} must be an exact version, got "${expected}".`);
  process.exit(1);
}

const packageJsonPaths = ['package.json'];
for (const dir of PACKAGE_DIRS) {
  for (const entry of readdirSync(join(rootDir, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name, 'package.json');
    if (entry.isDirectory() && existsSync(join(rootDir, path))) {
      packageJsonPaths.push(path);
    }
  }
}

const mismatches = [];
for (const path of packageJsonPaths) {
  const packageJson = readPackageJson(path);
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of PLAYWRIGHT_PACKAGES) {
      const version = packageJson[field]?.[name];
      if (version !== undefined && version !== expected) {
        mismatches.push(`  ${path}: ${field}["${name}"] is "${version}"`);
      }
    }
  }
}

if (mismatches.length) {
  console.error(`All Playwright dependencies must be pinned to "${expected}" (from ${REFERENCE_PACKAGE_JSON}):`);
  console.error(mismatches.join('\n'));
  process.exit(1);
}

console.log(`All Playwright dependencies are pinned to ${expected}.`);
