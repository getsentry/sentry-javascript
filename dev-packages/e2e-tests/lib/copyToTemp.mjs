// @ts-check
/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} originalPath
 * @param {string} tmpDirPath
 * @returns {Promise<void>}
 */
export async function copyToTemp(originalPath, tmpDirPath) {
  // copy files to tmp dir
  await cp(originalPath, tmpDirPath, { recursive: true });

  fixPackageJson(tmpDirPath);
}

/**
 * @param {string} cwd
 */
function fixPackageJson(cwd) {
  const packageJsonPath = join(cwd, 'package.json');
  /** @type {{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; volta?: Record<string, unknown> }} */
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  // 1. Fix file dependencies
  if (packageJson.dependencies) {
    fixFileLinkDependencies(packageJson.dependencies);
  }
  if (packageJson.devDependencies) {
    fixFileLinkDependencies(packageJson.devDependencies);
  }

  // 2. Fix volta extends
  if (!packageJson.volta) {
    throw new Error("No volta config found, please add one to the test app's package.json!");
  }

  if (typeof packageJson.volta.extends === 'string') {
    const extendsPath = packageJson.volta.extends;
    // We add a virtual dir to ensure that the relative depth is consistent
    // dirPath is relative to ./../test-applications/xxx
    const newPath = resolve(__dirname, 'virtual-dir/', extendsPath);
    packageJson.volta.extends = newPath;
    console.log(`Fixed volta.extends to ${newPath}`);
  } else {
    console.log('No volta.extends found');
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * Exported for pnpmOverrides as well
 * @param {Record<string, string>} dependencyObj
 */
export function fixFileLinkDependencies(dependencyObj) {
  for (const [key, value] of Object.entries(dependencyObj)) {
    const prefix = value.startsWith('link:') ? 'link:' : value.startsWith('file:') ? 'file:' : null;
    if (!prefix) {
      continue;
    }

    const dirPath = value.slice(prefix.length);
    if (isAbsolute(dirPath)) {
      continue;
    }

    // We add a virtual dir to ensure that the relative depth is consistent
    // dirPath is relative to ./../test-applications/xxx
    const absPath = resolve(__dirname, 'virtual-dir', dirPath);

    dependencyObj[key] = `${prefix}${absPath}`;
    console.log(`Fixed ${key} dependency to ${absPath}`);
  }
}
