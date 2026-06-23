/* eslint-disable no-console */
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

console.log('Installing all dependencies for fixtures...');

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// The fixtures install `@sentry/bundler-plugins` from a packed tarball.
//
// Build it through nx (`build:dev:filter`) rather than running its `yarn build` directly:
// `@sentry/bundler-plugins` bundles and typechecks against `@sentry/core`'s `build/` output, and
// the nx `build:dev` target's `dependsOn: ["^build:transpile", "^build:types"]` ensures those
// workspace dependencies are built first. A direct `yarn build` in the package would skip that
// and fail when `@sentry/core` hasn't been built yet (e.g. a standalone run without a prior
// monorepo build). Then `build:tarball` (npm pack) produces `sentry-bundler-plugins-<version>.tgz`
// so the fixture installs below resolve the local build rather than a published version.
const repoRoot = join(__dirname, '..', '..');
const bundlerPluginsDir = join(repoRoot, 'packages', 'bundler-plugins');
console.log('Building @sentry/bundler-plugins and its workspace dependencies...');
execSync('yarn build:dev:filter @sentry/bundler-plugins', { cwd: repoRoot, stdio: 'inherit' });
console.log('Packing @sentry/bundler-plugins...');
execSync('yarn build:tarball', { cwd: bundlerPluginsDir, stdio: 'inherit' });

const fixturesDir = join(__dirname, 'fixtures');
const entries = await fs.readdir(fixturesDir, { withFileTypes: true });

// Get all directories
const directories = entries.filter(entry => entry.isDirectory()).map(entry => join(fixturesDir, entry.name));

for (const dir of directories) {
  try {
    const pkgString = await fs.readFile(join(dir, 'package.json'), { encoding: 'utf-8' });
    const packageJson = JSON.parse(pkgString);
    // If there are no dependencies, skip installation
    if (!packageJson.dependencies) {
      continue;
    }
  } catch {
    continue;
  }

  execSync('pnpm install --force', {
    cwd: dir,
    stdio: 'inherit',
  });
}

console.log('All fixture dependencies installed successfully!');
