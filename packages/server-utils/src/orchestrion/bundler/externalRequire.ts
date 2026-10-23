import { isPlainObject } from '@sentry/core';
import { readFileSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { isAbsolute } from 'node:path';
import type { Plugin } from 'vite';

type ResolveIdHandler = Extract<NonNullable<Plugin['resolveId']>, (...args: never[]) => unknown>;
type ResolveIdParameters = Parameters<ResolveIdHandler>;

const NODE_MODULES = '/node_modules/';

/**
 * Creates a `resolveId` handler that bundles the external packages that bundled CommonJS `require()`s.
 *
 * Rolldown keeps these calls as `__require()`, which a second bundler over the server output can't follow:
 * - https://vite.dev/guide/migration#require-calls-for-externalized-modules
 * - https://rolldown.rs/in-depth/bundling-cjs#require-external-modules
 *
 * Only handles requires from packages bundled for orchestrion, and from packages bundled because of them.
 */
export function createExternalRequireResolver(
  moduleNames: readonly string[],
): (this: ThisParameterType<ResolveIdHandler>, ...args: ResolveIdParameters) => Promise<string | null> {
  const bundledPackagesByEnvironment = new Map<string, Set<string>>();

  return async function resolveExternalRequire(source, importer, options) {
    if (
      !this.meta.rolldownVersion ||
      this.environment.mode !== 'build' ||
      options.kind !== 'require-call' ||
      !importer ||
      !isPackageSpecifier(source)
    ) {
      return null;
    }

    const bundledPackages = bundledPackagesByEnvironment.get(this.environment.name) ?? new Set(moduleNames);
    bundledPackagesByEnvironment.set(this.environment.name, bundledPackages);

    const owner = ownerPackage(importer);
    const name = packageName(source);
    if (
      !owner ||
      !bundledPackages.has(owner.name) ||
      isUserExternal(this.environment.config.resolve.external, source, name) ||
      isOptionalDependency(owner.dir, name)
    ) {
      return null;
    }

    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved) {
      return null;
    }
    // Vite bundles it anyway (e.g. under pnpm), so its own requires count too.
    if (!resolved.external) {
      bundledPackages.add(name);
      return null;
    }

    const file = resolveWithNode(source, importer);
    if (file) {
      bundledPackages.add(name);
    }
    return file ?? null;
  };
}

function isPackageSpecifier(source: string): boolean {
  return !isBuiltin(source) && !isAbsolute(source) && !/^[.\0]/.test(source);
}

// `pg-types/lib/x` → `pg-types`, `@scope/pkg/x` → `@scope/pkg`.
function packageName(specifier: string): string {
  const [first = '', second] = specifier.split('/');
  return first.startsWith('@') && second ? `${first}/${second}` : first;
}

// Uses the last `node_modules` segment, so nested and pnpm store paths work.
function ownerPackage(file: string): { name: string; dir: string } | undefined {
  const path = file.replace(/\\/g, '/');
  const start = path.lastIndexOf(NODE_MODULES);
  if (start === -1) {
    return undefined;
  }
  const name = packageName(path.slice(start + NODE_MODULES.length));
  return { name, dir: `${path.slice(0, start)}${NODE_MODULES}${name}` };
}

// Matches like Vite. `external: true` is Vite's SSR default, not a choice for this package.
function isUserExternal(external: readonly string[] | true, source: string, name: string): boolean {
  return Array.isArray(external) && external.some(entry => entry === source || entry === name);
}

// These can be missing or native, like `pg-native`.
function isOptionalDependency(packageDir: string, name: string): boolean {
  const manifest = readManifest(`${packageDir}/package.json`);
  if (!manifest) {
    return false;
  }
  const { peerDependenciesMeta, optionalDependencies } = manifest;
  const peerMeta = isPlainObject(peerDependenciesMeta) ? peerDependenciesMeta[name] : undefined;
  return (
    (isPlainObject(peerMeta) && peerMeta.optional === true) ||
    (isPlainObject(optionalDependencies) && name in optionalDependencies)
  );
}

// The file that `require()` loads at runtime.
function resolveWithNode(source: string, importer: string): string | undefined {
  try {
    return createRequire(importer).resolve(source);
  } catch {
    return undefined;
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
