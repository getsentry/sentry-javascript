// @ts-check
/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getE2eTestsPackageVersion, getPackedTarballs, packedSymlinkFilename } from './packedTarballUtils.mjs';

const e2eTestsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(e2eTestsRoot, '../..');
const packedDir = path.join(e2eTestsRoot, 'packed');

/**
 * Ensures `packed/<name>-packed.tgz` symlinks point at the current versioned tarballs under `packages/*`.
 * Run after `pnpm run build:tarball` at the repo root (or from CI after restoring the tarball cache).
 */
export function syncPackedTarballSymlinks() {
  fs.mkdirSync(packedDir, { recursive: true });

  for (const entry of fs.readdirSync(packedDir, { withFileTypes: true })) {
    if (!entry.name.endsWith('-packed.tgz')) {
      continue;
    }
    fs.rmSync(path.join(packedDir, entry.name), { recursive: true, force: true });
  }

  const tarballs = getPackedTarballs();
  if (tarballs.length === 0) {
    throw new Error(
      `No packed tarballs found for version ${getE2eTestsPackageVersion()} under packages/*/. Run "pnpm run build:tarball" at the repository root.`,
    );
  }

  for (const { name, tarballPath } of tarballs) {
    fs.symlinkSync(tarballPath, path.join(packedDir, packedSymlinkFilename(name)));
  }

  console.log(`Linked ${tarballs.length} tarball symlinks in ${path.relative(repositoryRoot, packedDir) || 'packed'}.`);
}
