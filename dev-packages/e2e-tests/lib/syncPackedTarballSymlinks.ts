/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import { sync as globSync } from 'glob';
import { packedSymlinkFilename, versionedTarballFilename } from './packedTarballUtils';

const e2eTestsRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(e2eTestsRoot, '../..');
const packedDir = path.join(e2eTestsRoot, 'packed');

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

/**
 * Ensures `packed/<name>-packed.tgz` symlinks point at the current versioned tarballs under `packages/*`.
 * Run after `yarn build:tarball` at the repo root (or from CI after restoring the tarball cache).
 */
export function syncPackedTarballSymlinks(): void {
  const { version } = readJson<{ version: string }>(path.join(e2eTestsRoot, 'package.json'));

  fs.mkdirSync(packedDir, { recursive: true });

  for (const entry of fs.readdirSync(packedDir, { withFileTypes: true })) {
    if (!entry.name.endsWith('-packed.tgz')) {
      continue;
    }
    fs.rmSync(path.join(packedDir, entry.name), { recursive: true, force: true });
  }

  const packageJsonPaths = globSync('packages/*/package.json', {
    cwd: repositoryRoot,
    absolute: true,
  });

  let linked = 0;
  for (const packageJsonPath of packageJsonPaths) {
    const pkg = readJson<{ name?: string }>(packageJsonPath);
    const name = pkg.name;
    if (!name || (!name.startsWith('@sentry/') && !name.startsWith('@sentry-internal/'))) {
      continue;
    }

    const packageDir = path.dirname(packageJsonPath);
    const expectedTarball = path.join(packageDir, versionedTarballFilename(name, version));

    if (!fs.existsSync(expectedTarball)) {
      continue;
    }

    const linkName = packedSymlinkFilename(name);
    const linkPath = path.join(packedDir, linkName);

    fs.symlinkSync(expectedTarball, linkPath);
    linked++;
  }

  if (linked === 0) {
    throw new Error(
      `No packed tarballs found for version ${version} under packages/*/. Run "yarn build:tarball" at the repository root.`,
    );
  }

  console.log(`Linked ${linked} tarball symlinks in ${path.relative(repositoryRoot, packedDir) || 'packed'}.`);
}
