import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GLOBAL_OBJ, type IntegrationFn } from '@sentry/core';
import { isCjs } from '../utils/detection';

type ModuleInfo = Record<string, string>;

let moduleCache: ModuleInfo | undefined;

const INTEGRATION_NAME = 'Modules';

declare const __SENTRY_SERVER_MODULES__: Record<string, string>;

/**
 * Reads the modules that were injected at build time into `__SENTRY_SERVER_MODULES__`
 * (e.g. by the Next.js SDK, to work around not having access to these at runtime).
 *
 * This MUST be read lazily (on every call) rather than captured once at module-evaluation
 * time, because the two supported bundlers inject the value differently:
 * - webpack replaces the `__SENTRY_SERVER_MODULES__` token with a literal via `DefinePlugin`
 *   (available as soon as this module is evaluated).
 * - Turbopack assigns `globalThis.__SENTRY_SERVER_MODULES__` at runtime, from a value-injection
 *   loader applied to `instrumentation.*`. The instrumentation file's ESM imports are hoisted
 *   above that assignment, so this module is evaluated *before* the global is set. A
 *   module-level `const` capture would therefore always be empty under Turbopack, silently
 *   disabling every module-detection-based auto integration (Vercel AI, OpenAI, Anthropic,
 *   Google GenAI, LangChain, LangGraph). See getsentry/sentry-javascript#19147.
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
    return require.cache ? Object.keys(require.cache as Record<string, unknown>) : [];
  } catch {
    return [];
  }
}

/** Extract information about package.json modules */
function collectModules(): ModuleInfo {
  return {
    ...getServerModules(),
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
