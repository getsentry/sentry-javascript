import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { GLOBAL_OBJ, type IntegrationFn } from '@sentry/core';

type ModuleInfo = Record<string, string>;

let moduleCache: ModuleInfo | undefined;

const INTEGRATION_NAME = 'Modules' as const;

declare const __SENTRY_SERVER_MODULES__: Record<string, string>;

/**
 * Reads the modules injected at build time into `__SENTRY_SERVER_MODULES__` (e.g. by the Next.js SDK).
 *
 * Must be read lazily (per call), not captured at module-eval time: webpack replaces the token via
 * `DefinePlugin` (available immediately), but Turbopack assigns `globalThis.__SENTRY_SERVER_MODULES__`
 * at runtime, *after* this module's imports are hoisted and evaluated. A `const` capture would be
 * empty under Turbopack. See getsentry/sentry-javascript#19147.
 */
function getServerModules(): Record<string, string> {
  // webpack: the token is replaced with a literal at build time.
  if (typeof __SENTRY_SERVER_MODULES__ !== 'undefined') {
    return __SENTRY_SERVER_MODULES__;
  }
  // Turbopack: the value is assigned onto the global object at runtime.
  return (
    (GLOBAL_OBJ as typeof GLOBAL_OBJ & { __SENTRY_SERVER_MODULES__?: Record<string, string> })
      .__SENTRY_SERVER_MODULES__ ?? {}
  );
}

const _modulesIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      event.modules = {
        ...event.modules,
        ..._getModules(),
      };

      return event;
    },
    getModules: _getModules,
  };
}) satisfies IntegrationFn;

/**
 * Add node modules / packages to the event.
 * For this, multiple sources are used:
 * - They can be injected at build time into the __SENTRY_SERVER_MODULES__ variable (e.g. in Next.js)
 * - They are extracted from the dependencies & devDependencies in the package.json file
 * - They are extracted from the require.cache (CJS only)
 */
export const modulesIntegration = _modulesIntegration;

function getRequireCachePaths(): string[] {
  try {
    return require.cache ? Object.keys(require.cache) : [];
  } catch {
    return [];
  }
}

/** Extract information about package.json modules */
function collectModules(): ModuleInfo {
  return {
    ...getServerModules(),
    ...getModulesFromPackageJson(),
    /*! rollup-include-cjs-only */
    ...collectRequireModules(),
    /*! rollup-include-cjs-only-end */
  };
}

/**
 * Whether `dir` is a node_modules folder of the main module, a folder
 * `<that node_modules>/<.pnpm or .bun>/<package id>/node_modules`, where the isolated layouts of pnpm and Bun keep
 * each package, or a scope folder (`@scope`) in one of these folders.
 */
function isMainModulesDir(dir: string, mainPaths: string[]): boolean {
  if (basename(dir).startsWith('@')) {
    return isMainModulesDir(dirname(dir), mainPaths);
  }

  if (mainPaths.includes(dir)) {
    return true;
  }

  const storeDir = dirname(dirname(dir));
  return (
    basename(dir) === 'node_modules' &&
    ['.pnpm', '.bun'].includes(basename(storeDir)) &&
    mainPaths.includes(dirname(storeDir))
  );
}

/** Whether `require(name)` in the main module loads the package in `packageDir`. */
function isResolvedFromMain(name: string, packageDir: string, mainPaths: string[]): boolean {
  const resolvedDir = mainPaths.map(dir => join(dir, name)).find(dir => existsSync(dir));
  return !!resolvedDir && realpathSync(resolvedDir) === realpathSync(packageDir);
}

/** Extract information about package.json modules from require.cache */
function collectRequireModules(): ModuleInfo {
  const mainPaths = require.main?.paths || [];
  const paths = getRequireCachePaths();

  // We start with the modules from package.json (if possible)
  // These may be overwritten by more specific versions from the require.cache
  const infos: ModuleInfo = {};
  const packageDirs: Record<string, string> = {};
  const seen = new Set<string>();

  paths.forEach(path => {
    let dir = path;

    /** Traverse directories upward in the search of package.json file */
    const updir = (): void | (() => void) => {
      const orig = dir;
      dir = dirname(orig);

      if (!dir || orig === dir || seen.has(orig)) {
        return undefined;
      }
      if (!isMainModulesDir(dir, mainPaths)) {
        return updir();
      }

      const pkgfile = join(orig, 'package.json');
      seen.add(orig);

      if (!existsSync(pkgfile)) {
        return updir();
      }

      try {
        const info = JSON.parse(readFileSync(pkgfile, 'utf8')) as {
          name: string;
          version: string;
        };
        // The isolated layouts of pnpm and Bun keep every version of a package. Keep the one that the main module loads.
        const previousDir = packageDirs[info.name];
        if (!previousDir || !isResolvedFromMain(info.name, previousDir, mainPaths)) {
          infos[info.name] = info.version;
          packageDirs[info.name] = orig;
        }
      } catch {
        // no-empty
      }
    };

    updir();
  });

  return infos;
}

/** Fetches the list of modules and the versions loaded by the entry file for your node.js app. */
function _getModules(): ModuleInfo {
  if (!moduleCache) {
    moduleCache = collectModules();
  }
  return moduleCache;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function getPackageJson(): PackageJson {
  try {
    const filePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson;

    return packageJson;
  } catch {
    return {};
  }
}

function getModulesFromPackageJson(): ModuleInfo {
  const packageJson = getPackageJson();

  return {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
}
