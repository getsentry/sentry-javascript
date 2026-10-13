import * as assert from 'assert';
import * as fs from 'fs';
import { sync as globSync } from 'glob';
import * as path from 'path';

const repositoryRoot = path.resolve(__dirname, '../..');

const e2ePkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')) as { version: string };
const version = e2ePkg.version;

const tarballPaths = globSync(`packages/*/sentry-*-${version}.tgz`, {
  cwd: repositoryRoot,
  absolute: true,
});

assert.ok(
  tarballPaths.length > 0,
  `No tarballs found for version ${version}. Run "yarn build:tarball" at the repository root.`,
);

const symlinkPaths = globSync('packed/*-packed.tgz', {
  cwd: __dirname,
  absolute: true,
});

assert.ok(
  symlinkPaths.length > 0,
  'No packed tarball symlinks found. Run "yarn test:prepare" in dev-packages/e2e-tests.',
);

assert.strictEqual(
  symlinkPaths.length,
  tarballPaths.length,
  `Tarball count (${tarballPaths.length}) does not match packed symlink count (${symlinkPaths.length}). Re-run "yarn sync:packed-tarballs".`,
);

for (const symlinkPath of symlinkPaths) {
  const st = fs.lstatSync(symlinkPath);
  assert.ok(st.isSymbolicLink(), `Expected ${symlinkPath} to be a symlink.`);
  const target = path.resolve(path.dirname(symlinkPath), fs.readlinkSync(symlinkPath));
  assert.ok(fs.existsSync(target), `Symlink ${symlinkPath} points to missing file: ${target}`);
}
