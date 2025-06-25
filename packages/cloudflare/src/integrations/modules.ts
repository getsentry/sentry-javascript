import type * as NodeFs from 'node:fs';
import type * as NodePath from 'node:path';
import type { IntegrationFn } from '@sentry/core';
import { isCjs } from '../utils/commonjs';

type ModuleInfo = Record<string, string>;

let moduleCache: ModuleInfo | undefined;

const INTEGRATION_NAME = 'Modules';

declare const __SENTRY_SERVER_MODULES__: Record<string, string>;

// Node utils are not available in the worker runtime, so we need to import them dynamically
// So this may or may not be available at runtime
let nodeUtils:
  | undefined
  | {
      dirname: typeof NodePath.dirname;
      join: typeof NodePath.join;
      existsSync: typeof NodeFs.existsSync;
      readFileSync: typeof NodeFs.readFileSync;
    };

/**
 * `__SENTRY_SERVER_MODULES__` can be replaced at build time with the modules loaded by the server.
 * Right now, we leverage this in Next.js to circumvent the problem that we do not get access to these things at runtime.
 */
const SERVER_MODULES = typeof __SENTRY_SERVER_MODULES__ === 'undefined' ? {} : __SENTRY_SERVER_MODULES__;

const _modulesIntegration = (() => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  getNodeUtils();

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
    return require.cache ? Object.keys(require.cache as Record<string, unknown>) : [];
  } catch (e) {
    return [];
  }
}

/** Extract information about package.json modules */
function collectModules(): ModuleInfo {
  return {
    ...SERVER_MODULES,
    ...getModulesFromPackageJson(),
    ...(isCjs() ? collectRequireModules() : {}),
  };
}

async function getNodeUtils(): Promise<void> {
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { dirname, join } = await import('node:path');

    nodeUtils = {
      dirname,
      join,
      existsSync,
      readFileSync,
    };
  } catch {
    // no-empty
  }
}
/** Extract information about package.json modules from require.cache */
function collectRequireModules(): ModuleInfo {
  const mainPaths = require.main?.paths || [];
  const paths = getRequireCachePaths();

  // We start with the modules from package.json (if possible)
  // These may be overwritten by more specific versions from the require.cache
  const infos: ModuleInfo = {};
  const seen = new Set<string>();

  if (!nodeUtils) {
    return infos;
  }

  const { dirname, join, existsSync, readFileSync } = nodeUtils;

  paths.forEach(path => {
    let dir = path;

    /** Traverse directories upward in the search of package.json file */
    const updir = (): void | (() => void) => {
      const orig = dir;
      dir = dirname(orig);

      if (!dir || orig === dir || seen.has(orig)) {
        return undefined;
      }
      if (mainPaths.indexOf(dir) < 0) {
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
        infos[info.name] = info.version;
      } catch (_oO) {
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
  if (!nodeUtils) {
    return {};
  }

  const { join, readFileSync } = nodeUtils;

  try {
    const filePath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson;

    return packageJson;
  } catch (e) {
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
