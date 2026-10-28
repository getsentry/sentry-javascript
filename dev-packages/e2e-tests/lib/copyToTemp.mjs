// @ts-check
/* eslint-disable no-console */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

/** @typedef {{ name: string; version: string; onFail?: string }} RuntimeEntry */

/**
 * @param {string} originalPath
 * @param {string} tmpDirPath
 * @returns {Promise<void>}
 */
export async function copyToTemp(originalPath, tmpDirPath) {
  // copy files to tmp dir
  await cp(originalPath, tmpDirPath, { recursive: true });

  fixPackageJson(originalPath, tmpDirPath);
}

/**
 * @param {string} originalPath
 * @param {string} cwd
 */
function fixPackageJson(originalPath, cwd) {
  const packageJsonPath = join(cwd, 'package.json');
  /** @type {{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; devEngines?: { runtime?: RuntimeEntry | RuntimeEntry[] } & Record<string, unknown>; packageManager?: string }} */
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  // 1. Fix file dependencies
  if (packageJson.dependencies) {
    fixFileLinkDependencies(packageJson.dependencies);
  }
  if (packageJson.devDependencies) {
    fixFileLinkDependencies(packageJson.devDependencies);
  }

  // 2. Pin node and pnpm. The tmp dir has no parent package.json to inherit them from.
  const { nodeRuntime, packageManager } = resolveToolPins(originalPath);
  if (!nodeRuntime || !packageManager) {
    throw new Error(`Could not resolve the node and pnpm versions for ${originalPath}.`);
  }
  const ownRuntimes = [packageJson.devEngines?.runtime].flat().filter(runtime => runtime !== undefined);
  if (!ownRuntimes.some(runtime => runtime.name === 'node')) {
    const runtime = ownRuntimes.length ? [...ownRuntimes, nodeRuntime] : nodeRuntime;
    packageJson.devEngines = { ...packageJson.devEngines, runtime };
  }
  packageJson.packageManager = packageManager;
  console.log(`Pinned node ${nodeRuntime.version} and ${packageManager}`);

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * The nearest `devEngines.runtime` node entry and `packageManager` between the app and the repo root.
 * @param {string} appPath
 * @returns {{ nodeRuntime?: RuntimeEntry; packageManager?: string }}
 */
function resolveToolPins(appPath) {
  /** @type {RuntimeEntry | undefined} */
  let nodeRuntime;
  /** @type {string | undefined} */
  let packageManager;

  for (let dir = resolve(appPath); ; dir = dirname(dir)) {
    const packageJsonPath = join(dir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      nodeRuntime ??= [packageJson.devEngines?.runtime].flat().find(runtime => runtime?.name === 'node');
      packageManager ??= packageJson.packageManager;
    }
    if (dir === REPO_ROOT || dir === dirname(dir)) {
      return { nodeRuntime, packageManager };
    }
  }
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
