import * as fs from 'fs';
import * as path from 'path';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import type { SentryNuxtModuleOptions } from '../common/types';

/**
 *  Adds the `sentry.server.config.ts` file as `sentry.server.config.mjs` to the `.output` directory to be able to reference this file in the node --import option.
 *
 *  1. Adding the file as a rollup import, so it is included in the build (automatically transpiles the file).
 *  2. Copying the file to the `.output` directory after the build process is finished.
 */
export function addServerConfigToBuild(
  moduleOptions: SentryNuxtModuleOptions,
  nuxt: Nuxt,
  serverConfigFile: string,
): void {
  nuxt.hook('vite:extendConfig', async (viteInlineConfig, _env) => {
    if (
      typeof viteInlineConfig?.build?.rollupOptions?.input === 'object' &&
      'server' in viteInlineConfig.build.rollupOptions.input
    ) {
      // Create a rollup entry for the server config to add it as `sentry.server.config.mjs` to the build
      (viteInlineConfig.build.rollupOptions.input as { [entryName: string]: string })['sentry.server.config'] =
        createResolver(nuxt.options.srcDir).resolve(`/${serverConfigFile}`);
    }

    /**
     * When the build process is finished, copy the `sentry.server.config` file to the `.output` directory.
     * This is necessary because we need to reference this file path in the node --import option.
     */
    nuxt.hook('close', async () => {
      const source = path.resolve('.nuxt/dist/server/sentry.server.config.mjs');
      const destination = path.resolve('.output/server/sentry.server.config.mjs');

      try {
        await fs.promises.access(source, fs.constants.F_OK);
        await fs.promises.copyFile(source, destination);

        if (moduleOptions.debug) {
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry] Successfully added the content of the \`${serverConfigFile}\` file to \`${destination}\``,
          );
        }
      } catch (error) {
        if (moduleOptions.debug) {
          // eslint-disable-next-line no-console
          console.warn(
            `[Sentry] An error occurred when trying to add the \`${serverConfigFile}\` file to the \`.output\` directory`,
            error,
          );
        }
      }
    });
  });
}
