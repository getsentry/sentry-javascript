import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IntegrationFn } from '@sentry/core';
import { isCjs } from '../utils/detection';

type ModuleInfo = Record<string, string>;

let moduleCache: ModuleInfo | undefined;

const INTEGRATION_NAME = 'Modules';

declare const __SENTRY_SERVER_MODULES__: Record<string, string>;

/**
 * `__SENTRY_SERVER_MODULES__` can be replaced at build time with the modules loaded by the server.
 * Right now, we leverage this in Next.js to circumvent the problem that we do not get access to these things at runtime.
 */
const SERVER_MODULES = typeof __SENTRY_SERVER_MODULES__ === 'undefined' ? {} : __SENTRY_SERVER_MODULES__;

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
    return require.cache ? Object.keys(require.cache as Record<string, unknown>) : [];
  } catch {
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

/** Extract information about package.json modules from require.cache */
function collectRequireModules(): ModuleInfo {
  const mainPaths = require.main?.paths || [];
  const paths = getRequireCachePaths();

  // We start with the modules from package.json (if possible)
  // These may be overwritten by more specific versions from the require.cache
  const infos: ModuleInfo = {};
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
