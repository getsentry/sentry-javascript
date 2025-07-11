import { debug } from '@sentry/core';
import type { Nitro } from 'nitropack';
import { addSentryPluginToVite } from '../vite/sentrySolidStartVite';
import type { SentrySolidStartPluginOptions } from '../vite/types';
import {
  addDynamicImportEntryFileWrapper,
  addInstrumentationFileToBuild,
  addSentryTopImport,
} from './addInstrumentation';
import type { RollupConfig, SolidStartInlineConfig, SolidStartInlineServerConfig } from './types';

const defaultSentrySolidStartPluginOptions: Omit<
  SentrySolidStartPluginOptions,
  'experimental_entrypointWrappedFunctions'
> &
  Required<Pick<SentrySolidStartPluginOptions, 'experimental_entrypointWrappedFunctions'>> = {
  experimental_entrypointWrappedFunctions: ['default', 'handler', 'server'],
};

/**
 * Modifies the passed in Solid Start configuration with build-time enhancements such as
 * building the `instrument.server.ts` file into the appropriate build folder based on
 * build preset.
 *
 * @param solidStartConfig A Solid Start configuration object, as usually passed to `defineConfig` in `app.config.ts|js`
 * @param sentrySolidStartPluginOptions Options to configure the plugin
 * @returns The modified config to be exported and passed back into `defineConfig`
 */
export function withSentry(
  solidStartConfig: SolidStartInlineConfig = {},
  sentrySolidStartPluginOptions: SentrySolidStartPluginOptions,
): SolidStartInlineConfig {
  const sentryPluginOptions = {
    ...sentrySolidStartPluginOptions,
    ...defaultSentrySolidStartPluginOptions,
  };

  const server = (solidStartConfig.server || {}) as SolidStartInlineServerConfig;
  const hooks = server.hooks || {};
  const viteConfig = solidStartConfig.vite;
  const vite =
    typeof viteConfig === 'function'
      ? (...args: Parameters<typeof viteConfig>) => addSentryPluginToVite(viteConfig(...args), sentryPluginOptions)
      : addSentryPluginToVite(viteConfig, sentryPluginOptions);

  return {
    ...solidStartConfig,
    vite,
    server: {
      ...server,
      hooks: {
        ...hooks,
        async 'rollup:before'(nitro: Nitro, config: RollupConfig) {
          if (sentrySolidStartPluginOptions?.autoInjectServerSentry === 'experimental_dynamic-import') {
            await addDynamicImportEntryFileWrapper({ nitro, rollupConfig: config, sentryPluginOptions });

            sentrySolidStartPluginOptions.debug &&
              debug.log(
                'Wrapping the server entry file with a dynamic `import()`, so Sentry can be preloaded before the server initializes.',
              );
          } else {
            await addInstrumentationFileToBuild(nitro);

            if (sentrySolidStartPluginOptions?.autoInjectServerSentry === 'top-level-import') {
              await addSentryTopImport(nitro);
            }
          }

          // Run user provided hook
          if (hooks['rollup:before']) {
            hooks['rollup:before'](nitro);
          }
        },
      },
    },
  };
}
