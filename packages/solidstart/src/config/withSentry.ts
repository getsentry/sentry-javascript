import type { Nitro } from 'nitropack';
import { addSentryPluginToVite } from '../vite';
import type { SentrySolidStartPluginOptions } from '../vite/types';
import { addAutoInstrumentation, addInstrumentationFileToBuild } from './addInstrumentation';
import type { RollupConfig, SolidStartInlineConfig, SolidStartInlineServerConfig } from './types';

const defaultSentrySolidStartPluginOptions: SentrySolidStartPluginOptions = {
  autoInstrument: true,
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
export const withSentry = (
  solidStartConfig: SolidStartInlineConfig = {},
  sentrySolidStartPluginOptions: SentrySolidStartPluginOptions = defaultSentrySolidStartPluginOptions,
): SolidStartInlineConfig => {
  const server = (solidStartConfig.server || {}) as SolidStartInlineServerConfig;
  const hooks = server.hooks || {};
  const vite =
    typeof solidStartConfig.vite === 'function'
      ? (...args: unknown[]) => addSentryPluginToVite(solidStartConfig.vite(...args), sentrySolidStartPluginOptions)
      : addSentryPluginToVite(solidStartConfig.vite, sentrySolidStartPluginOptions);

  return {
    ...solidStartConfig,
    vite,
    server: {
      ...server,
      hooks: {
        ...hooks,
        async 'rollup:before'(nitro: Nitro, config: RollupConfig) {
          if (sentrySolidStartPluginOptions.autoInstrument) {
            await addAutoInstrumentation(nitro, config);
          } else {
            await addInstrumentationFileToBuild(nitro);
          }

          // Run user provided hook
          if (hooks['rollup:before']) {
            hooks['rollup:before'](nitro);
          }
        },
      },
    },
  };
};
