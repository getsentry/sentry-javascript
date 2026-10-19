import { isPlainObject } from '@sentry/core';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface InstalledPackage {
  dir: string;
  manifest: Record<string, unknown>;
}

/**
 * Names of the installed packages that the CommonJS code of `moduleNames` `require()`s, directly
 * or through other such packages.
 *
 * Only `dependencies` count. Optional and peer dependencies may be missing or native, and the app
 * owns them. The walk stops at ESM packages, because a static `import` of an external package
 * stays an `import` in the output.
 */
export function commonJSDependencyNames(root: string, moduleNames: readonly string[]): string[] {
  const names = new Set<string>();
  const visitedDirs = new Set<string>();

  const visit = (pkg: InstalledPackage): void => {
    if (visitedDirs.has(pkg.dir) || isESMOnly(pkg.manifest)) {
      return;
    }
    visitedDirs.add(pkg.dir);

    for (const name of requiredDependencyNames(pkg.manifest)) {
      const dependency = findInstalledPackage(name, pkg.dir);
      if (dependency) {
        names.add(name);
        visit(dependency);
      }
    }
  };

  for (const name of moduleNames) {
    const pkg = findInstalledPackage(name, root);
    if (pkg && !hasESMEntry(pkg.manifest)) {
      visit(pkg);
    }
  }

  return [...names];
}

// A `require()` loads the CommonJS build of a package, unless the package is ESM-only.
function isESMOnly(manifest: Record<string, unknown>): boolean {
  return manifest.type === 'module';
}

// The app `import`s instrumented packages, so a package with an ESM entry loads no CommonJS. A
// `module` field is the common sign. A wrapper like pg's `exports.import` still loads CommonJS.
function hasESMEntry(manifest: Record<string, unknown>): boolean {
  return isESMOnly(manifest) || typeof manifest.module === 'string';
}

function requiredDependencyNames(manifest: Record<string, unknown>): string[] {
  const optional = keysOf(manifest.optionalDependencies);
  return keysOf(manifest.dependencies).filter(name => !optional.includes(name));
}

function keysOf(value: unknown): string[] {
  return isPlainObject(value) ? Object.keys(value) : [];
}

// Looks up `node_modules` like Node does. The real path matters under isolated installs (pnpm),
// where a package's own dependencies are siblings of its real location, not of the symlink.
function findInstalledPackage(name: string, fromDir: string): InstalledPackage | undefined {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const packageDir = join(dir, 'node_modules', name);
    const manifest = readManifest(join(packageDir, 'package.json'));
    if (manifest) {
      return { dir: realpathSync(packageDir), manifest };
    }
    if (dirname(dir) === dir) {
      return undefined;
    }
  }
}

function readManifest(file: string): Record<string, unknown> | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isPlainObject(manifest) ? manifest : undefined;
  } catch {
    return undefined;
  }
}
