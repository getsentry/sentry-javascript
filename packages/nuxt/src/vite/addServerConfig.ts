import * as fs from 'fs';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/utils';
import type { Nitro } from 'nitropack';
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
  nitro: Nitro,
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
    nitro.hooks.hook('close', async () => {
      const rootDirResolver = createResolver(nitro.options.rootDir);
      const serverDirResolver = createResolver(nitro.options.output.serverDir);
      const source = rootDirResolver.resolve('.nuxt/dist/server/sentry.server.config.mjs');
      const destination = serverDirResolver.resolve('sentry.server.config.mjs');

      try {
        await fs.promises.access(source, fs.constants.F_OK);
        await fs.promises.copyFile(source, destination);

        if (moduleOptions.debug) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.log(
              `[Sentry] Successfully added the content of the \`${serverConfigFile}\` file to \`${destination}\``,
            );
          });
        }
      } catch (error) {
        if (moduleOptions.debug) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.warn(
              `[Sentry] An error occurred when trying to add the \`${serverConfigFile}\` file to the \`.output\` directory`,
              error,
            );
          });
        }
      }
    });
  });
}

/**
 *  Adds the Sentry server config import at the top of the server entry file to load the SDK on the server.
 *  This is necessary for environments where modifying the node option `--import` is not possible.
 *  However, only limited tracing instrumentation is supported when doing this.
 */
export function addSentryTopImport(moduleOptions: SentryNuxtModuleOptions, nitro: Nitro): void {
  nitro.hooks.hook('close', () => {
    // other presets ('node-server' or 'vercel') have an index.mjs
    const presetsWithServerFile = ['netlify'];
    const entryFileName =
      typeof nitro.options.rollupConfig?.output.entryFileNames === 'string'
        ? nitro.options.rollupConfig?.output.entryFileNames
        : presetsWithServerFile.includes(nitro.options.preset)
          ? 'server.mjs'
          : 'index.mjs';

    const serverDirResolver = createResolver(nitro.options.output.serverDir);
    const entryFilePath = serverDirResolver.resolve(entryFileName);

    try {
      fs.readFile(entryFilePath, 'utf8', (err, data) => {
        const updatedContent = `import './sentry.server.config.mjs';\n${data}`;

        fs.writeFile(entryFilePath, updatedContent, 'utf8', () => {
          if (moduleOptions.debug) {
            consoleSandbox(() => {
              // eslint-disable-next-line no-console
              console.log(
                `[Sentry] Successfully added the Sentry import to the server entry file "\`${entryFilePath}\`"`,
              );
            });
          }
        });
      });
    } catch (err) {
      if (moduleOptions.debug) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            `[Sentry] An error occurred when trying to add the Sentry import to the server entry file "\`${entryFilePath}\`":`,
            err,
          );
        });
      }
    }
  });
}
