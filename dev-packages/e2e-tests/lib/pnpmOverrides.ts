import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { getPublishedSentryTarballPackageNames, packedSymlinkFilename } from './packedTarballUtils';

/**
 * For a given temp test application directory, add pnpm.overrides to pin the internal Sentry packages to the packed tarballs.
 * This is used to ensure that the test application uses the correct version of the internal Sentry packages.
 * @param tmpDirPath - The temporary directory path of the test application.
 * @param packedDirPath - The path to the packed tarballs.
 * @param packageNames - The names of the internal Sentry packages to pin to the packed tarballs.
 * @returns
 */
export async function addPnpmOverrides(tmpDirPath: string, packedDirPath: string): Promise<void> {
  const packageJsonPath = path.join(tmpDirPath, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    pnpm?: { overrides?: Record<string, string> };
  };

  const overrides: Record<string, string> = {};

  const packageNames = getPublishedSentryTarballPackageNames();

  for (const packageName of packageNames) {
    overrides[packageName] = `file:${packedDirPath}/${packedSymlinkFilename(packageName)}`;
  }

  packageJson.pnpm = {
    overrides: {
      ...packageJson.pnpm?.overrides,
      ...overrides,
    },
  };

  // oxlint-disable-next-line no-console
  console.log(`Added ${packageNames.length} internal Sentry packages to pnpm.overrides`);

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
}
