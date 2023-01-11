import type { EventProcessor, Hub, Integration } from '@sentry/types';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

let moduleCache: { [key: string]: string };

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

/** Add node modules / packages to the event */
export class Modules implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Modules';

  /**
   * @inheritDoc
   */
  public name: string = Modules.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(event => {
      if (!getCurrentHub().getIntegration(Modules)) {
        return event;
      }
      return {
        ...event,
        modules: {
          ...event.modules,
          ...this._getModules(),
        },
      };
    });
  }

  /** Fetches the list of modules and the versions loaded by the entry file for your node.js app. */
  private _getModules(): { [key: string]: string } {
    if (!moduleCache) {
      moduleCache = collectModules();
    }
    return moduleCache;
  }
}
