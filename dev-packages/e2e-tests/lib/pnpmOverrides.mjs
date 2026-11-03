// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fixFileLinkDependencies } from './copyToTemp.mjs';
import { getPackedTarballs, packedSymlinkFilename } from './packedTarballUtils.mjs';

/**
 * For a given temp test application directory, add pnpm overrides to pin internal Sentry dependencies to their packed tarballs.
 * This is used to ensure that the test application uses the correct version of the internal Sentry packages.
 *
 * pnpm reads overrides only from pnpm-workspace.yaml. A fixture's existing overrides take precedence.
 * https://pnpm.io/settings/dependency-resolution#overrides
 *
 * @param {string} tmpDirPath - The temporary directory path of the test application.
 * @param {string} packedDirPath - The path to the packed tarballs.
 * @returns {Promise<void>}
 */
export async function addPnpmOverrides(tmpDirPath, packedDirPath) {
  const packageJsonPath = path.join(tmpDirPath, 'package.json');
  /** @type {{ pnpm?: unknown; resolutions?: unknown }} */
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  // pnpm 11+ ignores these fields, so their settings would silently have no effect.
  if (packageJson.pnpm || packageJson.resolutions) {
    throw new Error(
      `Move the "pnpm" and "resolutions" settings in ${packageJsonPath} to the app's pnpm-workspace.yaml`,
    );
  }

  const packageNames = getPackedTarballs().map(({ name }) => name);
  const overrides = Object.fromEntries(
    packageNames.map(packageName => [packageName, `file:${packedDirPath}/${packedSymlinkFilename(packageName)}`]),
  );

  const pnpmWorkspacePath = path.join(tmpDirPath, 'pnpm-workspace.yaml');
  const pnpmWorkspace = await readFile(pnpmWorkspacePath, 'utf8').catch(() => '');

  // Without it, pnpm skips versions published in the last day, which apps that test the newest releases need.
  if (!/^minimumReleaseAge: 0$/m.test(pnpmWorkspace)) {
    throw new Error(`Set "minimumReleaseAge: 0" in the app's pnpm-workspace.yaml (${pnpmWorkspacePath})`);
  }

  const existingOverrides = parseWorkspaceOverrides(pnpmWorkspace);
  fixFileLinkDependencies(existingOverrides);
  const workspaceOverrides = formatWorkspaceOverrides({ ...overrides, ...existingOverrides });
  const workspaceWithoutOverrides = removeWorkspaceOverrides(pnpmWorkspace);

  await writeFile(pnpmWorkspacePath, `${workspaceWithoutOverrides.trimEnd()}\noverrides:\n${workspaceOverrides}\n`);

  // oxlint-disable-next-line no-console
  console.log(`Added ${packageNames.length} internal Sentry package overrides`);
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
        const match = /^\s*('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"):\s*('(?:[^']|'')*'|"(?:[^"\\]|\\.)*")\s*$/.exec(line);
        if (!match?.[1] || !match[2]) {
          throw new Error(`Unsupported pnpm workspace override: ${line.trim()}`);
        }

        return [parseYamlString(match[1]), parseYamlString(match[2])];
      }),
  );
}

/**
 * @param {string} quoted
 * @returns {string}
 */
function parseYamlString(quoted) {
  return quoted.startsWith("'") ? quoted.slice(1, -1).replace(/''/g, "'") : JSON.parse(quoted);
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
