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
  const viteConfig = solidStartConfig.vite;
  const vite =
    typeof viteConfig === 'function'
      ? (...args: Parameters<typeof viteConfig>) => addSentryPluginToVite(viteConfig(...args), sentryPluginOptions)
      : addSentryPluginToVite(viteConfig, sentryPluginOptions);

  // Use a module so we don't override preset hooks.
  const sentryNitroModule = (nitro: Nitro) => {
    nitro.hooks.hook('rollup:before', async (nitro, rollupConfig) => {
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

  // `@vercel/nft` only traces the `module-sync` target of a package's `exports` map when the Node
  // process *running the build* is >= 22, but Node's CJS loader matches `module-sync` at runtime
  // from 20.19 — so a server built on Node 20 is missing files its own runtime resolves and crashes
  // with `MODULE_NOT_FOUND`. Nitro spreads `externals.traceOptions` into `nodeFileTrace()`, and
  // nft's `moduleSyncCatchall` option (>= 1.10.0, ignored by older versions) makes it emit both
  // targets. Remove once https://github.com/vercel/nft/issues/603 is fixed and picked up by Nitro.
  const existingExternals = (server as { externals?: { traceOptions?: Record<string, unknown> } }).externals;

  return {
    ...solidStartConfig,
    vite,
    server: {
      ...server,
      externals: {
        ...existingExternals,
        traceOptions: {
          moduleSyncCatchall: true,
          ...existingExternals?.traceOptions,
        },
      },
      modules: [...existingModules, sentryNitroModule],
    },
  };
}
