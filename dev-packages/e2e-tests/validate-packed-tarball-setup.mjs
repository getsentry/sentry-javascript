// @ts-check
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getE2eTestsPackageVersion, getPackedTarballs } from './lib/packedTarballUtils.mjs';

const tarballs = getPackedTarballs();

assert.ok(
  tarballs.length > 0,
  `No tarballs found for version ${getE2eTestsPackageVersion()}. Run "pnpm run build:tarball" at the repository root.`,
);

const packedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'packed');
const symlinkPaths = fs.existsSync(packedDir)
  ? fs
      .readdirSync(packedDir)
      .filter(name => name.endsWith('-packed.tgz'))
      .map(name => path.join(packedDir, name))
  : [];

assert.ok(
  symlinkPaths.length > 0,
  'No packed tarball symlinks found. Run "pnpm run test:prepare" in dev-packages/e2e-tests.',
);

assert.strictEqual(
  symlinkPaths.length,
  tarballs.length,
  `Tarball count (${tarballs.length}) does not match packed symlink count (${symlinkPaths.length}). Re-run "pnpm run test:prepare".`,
);

for (const symlinkPath of symlinkPaths) {
  const st = fs.lstatSync(symlinkPath);
  assert.ok(st.isSymbolicLink(), `Expected ${symlinkPath} to be a symlink.`);
  const target = path.resolve(path.dirname(symlinkPath), fs.readlinkSync(symlinkPath));
  assert.ok(fs.existsSync(target), `Symlink ${symlinkPath} points to missing file: ${target}`);
}
