import { readFileSync } from 'node:fs';
import { GLOBAL_OBJ, type IntegrationFn } from '@sentry/core';
import { _INTERNAL_collectInstalledModules } from '@sentry/core/server';

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
 * Adds the app's packages to the event, with exact installed versions where they resolve from the entry file.
 * Declared ranges and build-time injected versions fill in packages that are not installed, such as bundled ones.
 */
export const modulesIntegration = _modulesIntegration;

function readFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function getRequireCachePaths(): string[] {
  try {
    return require.cache ? Object.keys(require.cache) : [];
  } catch {
    return [];
  }
}

function collectModules(): ModuleInfo {
  const { declared, installed } = _INTERNAL_collectInstalledModules({
    readFile,
    entryPath: process.argv[1],
    cwd: process.cwd(),
    loadedFiles: [
      /*! rollup-include-cjs-only */
      ...getRequireCachePaths(),
      /*! rollup-include-cjs-only-end */
    ],
  });
  return { ...declared, ...getServerModules(), ...installed };
}

/** Fetches the list of modules and the versions loaded by the entry file for your node.js app. */
function _getModules(): ModuleInfo {
  if (!moduleCache) {
    moduleCache = collectModules();
  }
  return moduleCache;
}
