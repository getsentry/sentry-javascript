import { existsSync, readFileSync } from 'node:fs';
import { Module } from 'node:module';
import type { IntegrationFn } from '@sentry/core';
import { collectInstalledModules } from '@sentry/server-utils';

type ModuleInfo = Record<string, string>;

let moduleCache: ModuleInfo | undefined;

const INTEGRATION_NAME = 'Modules' as const;

declare const __SENTRY_SERVER_MODULES__: Record<string, string> | string;

/** Reads the module versions that a bundler injected at build time. */
function getServerModules(): Record<string, string> {
  if (typeof __SENTRY_SERVER_MODULES__ === 'undefined') {
    return {};
  }
  if (typeof __SENTRY_SERVER_MODULES__ !== 'string') {
    return __SENTRY_SERVER_MODULES__;
  }
  // Next.js Turbopack builds pass JSON, because `compiler.defineServer` only accepts strings.
  try {
    return JSON.parse(__SENTRY_SERVER_MODULES__) as Record<string, string>;
  } catch {
    return {};
  }
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
 * Adds the app's packages to the event. Versions injected at build time (e.g. by the Next.js SDK) are used as is.
 * Otherwise, it uses exact installed versions where they resolve from the entry file, and declared ranges for the rest.
 */
export const modulesIntegration = _modulesIntegration;

function readFile(path: string): string | undefined {
  try {
    // Throwing on the many missing files would pause the debugger each time when localVariables captures caught
    // exceptions, which trips its rate limit.
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

/** Files loaded through the CommonJS loader, which includes CommonJS packages imported from ESM. */
function getLoadedCommonJsFiles(): string[] {
  try {
    return Object.keys((Module as { _cache?: Record<string, unknown> })._cache || {});
  } catch {
    return [];
  }
}

function collectModules(): ModuleInfo {
  const serverModules = getServerModules();
  // The build already resolved exact versions, so skip the file reads at runtime.
  if (Object.keys(serverModules).length) {
    return serverModules;
  }
  return collectInstalledModules({
    readFile,
    entryPath: process.argv[1],
    cwd: process.cwd(),
    loadedFiles: getLoadedCommonJsFiles(),
  });
}

/** Fetches the list of modules and the versions loaded by the entry file for your node.js app. */
function _getModules(): ModuleInfo {
  if (!moduleCache) {
    moduleCache = collectModules();
  }
  return moduleCache;
}
