import { addSentryPluginToVite } from '../vite';
import type { SentrySolidStartPluginOptions } from '../vite/types';
import {
  addInstrumentationFileToBuild,
  experimental_addInstrumentationFileTopLevelImportToServerEntry,
} from './addInstrumentation';
import type { Nitro, SolidStartInlineConfig, SolidStartInlineServerConfig } from './types';

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
  sentrySolidStartPluginOptions: SentrySolidStartPluginOptions = {},
): SolidStartInlineConfig => {
  const server = (solidStartConfig.server || {}) as SolidStartInlineServerConfig;
  const hooks = server.hooks || {};
  const vite =
    typeof solidStartConfig.vite === 'function'
      ? (...args: unknown[]) => addSentryPluginToVite(solidStartConfig.vite(...args), sentrySolidStartPluginOptions)
      : addSentryPluginToVite(solidStartConfig.vite, sentrySolidStartPluginOptions);

  let serverDir: string;
  let buildPreset: string;

  return {
    ...solidStartConfig,
    vite,
    server: {
      ...server,
      hooks: {
        ...hooks,
        async close() {
          if (sentrySolidStartPluginOptions.experimental_basicServerTracing) {
            await experimental_addInstrumentationFileTopLevelImportToServerEntry(serverDir, buildPreset);
          }

          // Run user provided hook
          if (hooks.close) {
            hooks.close();
          }
        },
        async 'rollup:before'(nitro: Nitro) {
          serverDir = nitro.options.output.serverDir;
          buildPreset = nitro.options.preset;

          await addInstrumentationFileToBuild(nitro);

          // Run user provided hook
          if (hooks['rollup:before']) {
            hooks['rollup:before'](nitro);
          }
        },
      },
    },
  };
};
