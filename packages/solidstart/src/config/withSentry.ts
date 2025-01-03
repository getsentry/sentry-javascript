import type { Nitro } from 'nitropack';
import { addSentryPluginToVite } from '../vite';
import type { SentrySolidStartPluginOptions } from '../vite/types';
import { addInstrumentationFileToBuild, addSentryTopImport } from './addInstrumentation';
import type { SolidStartInlineConfig, SolidStartInlineServerConfig } from './types';

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
  };

  const server = (solidStartConfig.server || {}) as SolidStartInlineServerConfig;
  const hooks = server.hooks || {};
  const vite =
    typeof solidStartConfig.vite === 'function'
      ? (...args: unknown[]) => addSentryPluginToVite(solidStartConfig.vite(...args), sentryPluginOptions)
      : addSentryPluginToVite(solidStartConfig.vite, sentryPluginOptions);

  return {
    ...solidStartConfig,
    vite,
    server: {
      ...server,
      hooks: {
        ...hooks,
        async 'rollup:before'(nitro: Nitro) {
          await addInstrumentationFileToBuild(nitro);

          if (sentrySolidStartPluginOptions?.autoInjectServerSentry === 'top-level-import') {
            await addSentryTopImport(nitro);
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
