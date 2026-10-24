import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'rollup';
import { isInDirectory } from './utils';

/**
 * Nitro 3 bundles the output of its Vite services, like Nuxt 5's `ssr` build, again. It loads that output without the
 * `.map` files next to it, so the server source maps stop at the output instead of the original source files.
 * Returning the map from `load` lets the bundler chain both maps.
 *
 * Nuxt's own `SourcemapPreserverPlugin` does this only when Nitro does not build as a Vite environment.
 */
export function serviceSourceMapsPlugin(buildDir: string): Plugin {
  const servicesDir = path.join(buildDir, 'vite', 'services');

  return {
    name: 'sentry-nuxt-service-source-maps',
    async load(id) {
      const mapFile = `${id}.map`;
      // Rolldown emits no map for a chunk without mappable source.
      if (!isInDirectory(id, servicesDir) || !fs.existsSync(mapFile)) {
        return null;
      }

      const [code, map] = await Promise.all([fs.promises.readFile(id, 'utf8'), fs.promises.readFile(mapFile, 'utf8')]);
      return { code, map };
    },
  };
}
