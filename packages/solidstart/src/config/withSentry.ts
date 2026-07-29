import { debug } from '@sentry/core';
import { INSTRUMENTED_MODULE_NAMES } from '@sentry/server-utils/orchestrion/config';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
import type { Nitro } from 'nitropack';
import { addSentryPluginToVite } from '../vite/sentrySolidStartVite';
import type { SentrySolidStartPluginOptions } from '../vite/types';
import {
  addDynamicImportEntryFileWrapper,
  addInstrumentationFileToBuild,
  addSentryTopImport,
} from './addInstrumentation';
import type { RollupConfig, SolidStartInlineConfig, SolidStartInlineServerConfig } from './types';

// ioredis requires this CommonJS helper to be bundled with it. Leaving it
// external makes Nitro resolve the default export as a namespace object.
const IORedisDependencies = ['standard-as-callback'];

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
  const viteConfig = solidStartConfig.vite;
  const vite =
    typeof viteConfig === 'function'
      ? (...args: Parameters<typeof viteConfig>) => addSentryPluginToVite(viteConfig(...args), sentryPluginOptions)
      : addSentryPluginToVite(viteConfig, sentryPluginOptions);

  const addBuildTimeInstrumentation = sentryPluginOptions.buildTimeInstrumentation !== false;

  // Use a module so we don't override preset hooks.
  const sentryNitroModule = (nitro: Nitro) => {
    nitro.hooks.hook('rollup:before', async (nitro, rollupConfig) => {
      if (addBuildTimeInstrumentation) {
        (rollupConfig as unknown as RollupConfig).plugins.push(
          sentryOrchestrionPlugin({ buildTimeInstrumentation: sentryPluginOptions.buildTimeInstrumentation }),
        );
      }

      if (sentrySolidStartPluginOptions?.autoInjectServerSentry === 'experimental_dynamic-import') {
        await addDynamicImportEntryFileWrapper({
          nitro,
          rollupConfig: rollupConfig as unknown as RollupConfig,
          sentryPluginOptions,
        });

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
    });
  };

  const existingModules = (server as SolidStartInlineServerConfig & { modules?: unknown[] }).modules || [];

  // An externalized dependency never passes through the orchestrion code transform, so force-inline
  // the instrumented modules. This has to be set statically on the Nitro config (not in a hook)
  // because externalization is a resolution-time decision made before Rollup normalizes `external`.
  let externals = (server as SolidStartInlineServerConfig & { externals?: { inline?: string[] } }).externals;
  if (addBuildTimeInstrumentation) {
    const existingInline = externals?.inline || [];
    externals = {
      ...externals,
      inline: [...new Set([...existingInline, ...INSTRUMENTED_MODULE_NAMES, ...IORedisDependencies])],
    };
  }

  return {
    ...solidStartConfig,
    vite,
    server: {
      ...server,
      externals,
      modules: [...existingModules, sentryNitroModule],
    },
  };
}
