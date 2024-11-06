import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { isCjs } from '../utils/commonjs';

let moduleCache: { [key: string]: string };

const INTEGRATION_NAME = 'Modules';

const _modulesIntegration = (() => {
  // This integration only works in CJS contexts
  if (!isCjs()) {
    DEBUG_BUILD &&
      logger.warn(
        'modulesIntegration only works in CommonJS (CJS) environments. Remove this integration if you are using ESM.',
      );
    return {
      name: INTEGRATION_NAME,
    };
  }

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      event.modules = {
        ...event.modules,
        ..._getModules(),
      };

      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Add node modules / packages to the event.
 *
 * Only works in CommonJS (CJS) environments.
 */
export const modulesIntegration = defineIntegration(_modulesIntegration);

/** Extract information about paths */
function getPaths(): string[] {
  try {
    return require.cache ? Object.keys(require.cache as Record<string, unknown>) : [];
  } catch (e) {
    return [];
  }
}

/** Extract information about package.json modules */
function collectModules(): {
  [name: string]: string;
} {
  const mainPaths = (require.main && require.main.paths) || [];
  const paths = getPaths();
  const infos: {
    [name: string]: string;
  } = {};
  const seen: {
    [path: string]: boolean;
  } = {};

  paths.forEach(path => {
    let dir = path;

    /** Traverse directories upward in the search of package.json file */
    const updir = (): void | (() => void) => {
      const orig = dir;
      dir = dirname(orig);

      if (!dir || orig === dir || seen[orig]) {
        return undefined;
      }
      if (mainPaths.indexOf(dir) < 0) {
        return updir();
      }

      const pkgfile = join(orig, 'package.json');
      seen[orig] = true;

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
function _getModules(): { [key: string]: string } {
  if (!moduleCache) {
    moduleCache = collectModules();
  }
  return moduleCache;
}
