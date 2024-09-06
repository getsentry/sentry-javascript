import * as fs from 'fs';
import * as path from 'path';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 *  Adds the `server.config.ts` file as `instrument-sentry.mjs` to the `.output` directory to be able to reference this file in the node --import option.
 *
 *  1. Adding the file as a rollup import, so it is included in the build (automatically transpiles the file).
 *  2. Copying the file to the `.output` directory after the build process is finished.
 */
export function addServerConfigToBuild(
  moduleOptions: SentryNuxtModuleOptions,
  nuxt: Nuxt,
  serverConfigFile: string,
): void {
  if (moduleOptions.debug) {
    // eslint-disable-next-line no-console
    console.log(
      '[Sentry] Using your `sentry.server.config` file for the server-side Sentry configuration. In case you have a `public/instrument.server` file, it will be ignored.',
    );
  }

  nuxt.hook('vite:extendConfig', async (viteInlineConfig, _env) => {
    if (
      typeof viteInlineConfig?.build?.rollupOptions?.input === 'object' &&
      'server' in viteInlineConfig.build.rollupOptions.input
    ) {
      // Create a rollup entry for the server config to add it as `instrument-sentry.mjs` to the build
      (viteInlineConfig.build.rollupOptions.input as { [entryName: string]: string })['instrument-sentry'] =
        createResolver(nuxt.options.srcDir).resolve(`/${serverConfigFile}`);
    }

    /**
     * When the build process is finished, copy the `sentry.server.config` file to the `.output` directory.
     * This is necessary because we need to reference this file path in the node --import option.
     */
    nuxt.hook('close', async () => {
      const source = path.resolve('.nuxt/dist/server/instrument-sentry.mjs');
      const destination = path.resolve('.output/server/instrument-sentry.mjs');

      try {
        await fs.promises.access(source, fs.constants.F_OK);
        await fs.promises.copyFile(source, destination);

        if (moduleOptions.debug) {
          // eslint-disable-next-line no-console
          console.log(
            '[Sentry] Successfully added the content of the `sentry.server.config` file as `instrument-sentry.mjs` to the `.output/server` directory',
          );
        }
      } catch (error) {
        if (moduleOptions.debug) {
          // eslint-disable-next-line no-console
          console.warn(
            '[Sentry] An error occurred when trying to add the `sentry.server.config` file to the `.output` directory',
            error,
          );
        }
      }
    });
  });
}
