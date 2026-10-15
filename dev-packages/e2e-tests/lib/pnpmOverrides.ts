import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { getPublishedSentryTarballPackageNames, packedSymlinkFilename } from './packedTarballUtils';
import { fixFileLinkDependencies } from './copyToTemp';

/**
 * For a given temp test application directory, add pnpm overrides to pin internal Sentry dependencies to their packed tarballs.
 * This is used to ensure that the test application uses the correct version of the internal Sentry packages.
 *
 * pnpm reads overrides only from pnpm-workspace.yaml. A fixture's existing overrides take precedence.
 * https://pnpm.io/settings/dependency-resolution#overrides
 *
 * @param tmpDirPath - The temporary directory path of the test application.
 * @param packedDirPath - The path to the packed tarballs.
 */
export async function addPnpmOverrides(tmpDirPath: string, packedDirPath: string): Promise<void> {
  const packageJsonPath = path.join(tmpDirPath, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { pnpm?: unknown; resolutions?: unknown };

  // pnpm 11+ ignores these fields, so their settings would silently have no effect.
  if (packageJson.pnpm || packageJson.resolutions) {
    throw new Error(
      `Move the "pnpm" and "resolutions" settings in ${packageJsonPath} to the app's pnpm-workspace.yaml`,
    );
  }

  const packageNames = getPublishedSentryTarballPackageNames();
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

function parseWorkspaceOverrides(workspace: string): Record<string, string> {
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

function parseYamlString(quoted: string): string {
  return quoted.startsWith("'") ? quoted.slice(1, -1).replace(/''/g, "'") : (JSON.parse(quoted) as string);
}

function removeWorkspaceOverrides(workspace: string): string {
  return workspace.replace(/^overrides:\n(?:[ \t]+.*(?:\n|$))*/m, '');
}

function formatWorkspaceOverrides(overrides: Record<string, string>): string {
  return Object.entries(overrides)
    .map(([packageName, target]) => `  ${JSON.stringify(packageName)}: ${JSON.stringify(target)}`)
    .join('\n');
}
