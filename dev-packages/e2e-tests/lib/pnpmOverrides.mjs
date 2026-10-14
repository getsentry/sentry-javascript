// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fixFileLinkDependencies } from './copyToTemp.mjs';
import { getPackedTarballs, packedSymlinkFilename } from './packedTarballUtils.mjs';

/** @typedef {{ pnpm?: { overrides?: Record<string, string> }; volta?: { extends?: string; pnpm?: string } }} PackageJson */

/**
 * For a given temp test application directory, add pnpm overrides to pin internal Sentry dependencies to their packed tarballs.
 * This is used to ensure that the test application uses the correct version of the internal Sentry packages.
 *
 * pnpm 11 requires overrides in pnpm-workspace.yaml, while older versions use
 * package.json. A fixture's existing overrides take precedence in both cases.
 * https://pnpm.io/settings/dependency-resolution#overrides
 *
 * @param {string} tmpDirPath - The temporary directory path of the test application.
 * @param {string} packedDirPath - The path to the packed tarballs.
 * @returns {Promise<void>}
 */
export async function addPnpmOverrides(tmpDirPath, packedDirPath) {
  const packageJsonPath = path.join(tmpDirPath, 'package.json');
  /** @type {PackageJson} */
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  const packageNames = getPackedTarballs().map(({ name }) => name);
  const overrides = Object.fromEntries(
    packageNames.map(packageName => [packageName, `file:${packedDirPath}/${packedSymlinkFilename(packageName)}`]),
  );

  const existingOverrides = packageJson.pnpm?.overrides ?? {};
  fixFileLinkDependencies(existingOverrides);
  const mergedOverrides = { ...overrides, ...existingOverrides };

  const pnpmMajor = await getPnpmMajor(packageJsonPath, packageJson);

  if (pnpmMajor < 11) {
    packageJson.pnpm = { ...packageJson.pnpm, overrides: mergedOverrides };
  } else {
    // pnpm 11: https://github.com/pnpm/pnpm/issues/11536
    const pnpmWorkspacePath = path.join(tmpDirPath, 'pnpm-workspace.yaml');
    const pnpmWorkspace = await readFile(pnpmWorkspacePath, 'utf8').catch(() => '');
    const existingWorkspaceOverrides = parseWorkspaceOverrides(pnpmWorkspace);
    const workspaceOverrides = formatWorkspaceOverrides({ ...mergedOverrides, ...existingWorkspaceOverrides });
    const workspaceWithoutOverrides = removeWorkspaceOverrides(pnpmWorkspace);

    await writeFile(pnpmWorkspacePath, `${workspaceWithoutOverrides.trimEnd()}\noverrides:\n${workspaceOverrides}\n`);

    delete packageJson.pnpm?.overrides;
    if (packageJson.pnpm && Object.keys(packageJson.pnpm).length === 0) {
      delete packageJson.pnpm;
    }
  }

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // oxlint-disable-next-line no-console
  console.log(`Added ${packageNames.length} internal Sentry package overrides`);
}

/**
 * Keep in sync with `.github/actions/install-pnpm`, which installs the version this finds in CI.
 * @param {string} packageJsonPath
 * @param {PackageJson} packageJson
 * @returns {Promise<number>}
 */
async function getPnpmMajor(packageJsonPath, packageJson) {
  const pnpmVersion = packageJson.volta?.pnpm;
  if (pnpmVersion) {
    const major = /^(?<major>\d+)(?:\.|$)/.exec(pnpmVersion)?.groups?.major;
    if (!major) {
      throw new Error(`Invalid Volta pnpm version in ${packageJsonPath}: ${pnpmVersion}`);
    }

    return Number(major);
  }

  const voltaExtends = packageJson.volta?.extends;
  if (voltaExtends) {
    const extendedPackageJsonPath = path.resolve(path.dirname(packageJsonPath), voltaExtends);
    /** @type {PackageJson} */
    const extendedPackageJson = JSON.parse(await readFile(extendedPackageJsonPath, 'utf8'));
    return getPnpmMajor(extendedPackageJsonPath, extendedPackageJson);
  }

  throw new Error(`No Volta pnpm version found for ${packageJsonPath}`);
}

/**
 * @param {string} workspace
 * @returns {Record<string, string>}
 */
function parseWorkspaceOverrides(workspace) {
  const overrides = /^overrides:\n((?:[ \t]+.*(?:\n|$))*)/m.exec(workspace)?.[1];
  if (!overrides) {
    return {};
  }

  return Object.fromEntries(
    overrides
      .trim()
      .split('\n')
      .map(line => {
        const match = /^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*")\s*$/.exec(line);
        if (!match?.[1] || !match[2]) {
          throw new Error(`Unsupported pnpm workspace override: ${line.trim()}`);
        }

        return [JSON.parse(match[1]), JSON.parse(match[2])];
      }),
  );
}

/**
 * @param {string} workspace
 * @returns {string}
 */
function removeWorkspaceOverrides(workspace) {
  return workspace.replace(/^overrides:\n(?:[ \t]+.*(?:\n|$))*/m, '');
}

/**
 * @param {Record<string, string>} overrides
 * @returns {string}
 */
function formatWorkspaceOverrides(overrides) {
  return Object.entries(overrides)
    .map(([packageName, target]) => `  ${JSON.stringify(packageName)}: ${JSON.stringify(target)}`)
    .join('\n');
}
