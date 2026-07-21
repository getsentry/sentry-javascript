import { consoleSandbox } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin } from 'vite';
import type { AutoInstrumentSelection } from './autoInstrument';
import { makeAutoInstrumentationPlugin } from './autoInstrument';
import { detectAdapter } from './detectAdapter';
import { makeGlobalValuesInjectionPlugin } from './injectGlobalValues';
import { makeCustomSentryVitePlugins } from './sourceMaps';
import { loadSvelteConfig } from './svelteConfig';
import type { CustomSentryVitePluginOptions, SentrySvelteKitPluginOptions } from './types';

const DEFAULT_PLUGIN_OPTIONS: SentrySvelteKitPluginOptions = {
  autoUploadSourceMaps: true,
  autoInstrument: true,
  debug: false,
};

/**
 * Vite Plugins for the Sentry SvelteKit SDK, taking care of creating
 * Sentry releases and uploading source maps to Sentry.
 *
 * Sentry adds a few additional properties to your Vite config.
 * Make sure, it is registered before the SvelteKit plugin.
 */
export async function sentrySvelteKit(options: SentrySvelteKitPluginOptions = {}): Promise<Plugin[]> {
  const svelteConfig = await loadSvelteConfig();

  const mergedOptions = {
    ...DEFAULT_PLUGIN_OPTIONS,
    ...options,
    adapter: options.adapter || (await detectAdapter(svelteConfig, options.debug)),
  };

  const sentryPlugins: Plugin[] = [makeBrowserTracingVariantResolverPlugin()];

  if (mergedOptions.autoInstrument) {
    // SvelteKit 3 (>= next.8) promoted `tracing` out of `experimental`; older versions nest it there.
    const kitTracingEnabled = !!(svelteConfig.kit?.tracing?.server || svelteConfig.kit?.experimental?.tracing?.server);

    const pluginOptions: AutoInstrumentSelection = {
      load: true,
      serverLoad: true,
      ...(typeof mergedOptions.autoInstrument === 'object' ? mergedOptions.autoInstrument : {}),
    };

    sentryPlugins.push(
      makeAutoInstrumentationPlugin({
        ...pluginOptions,
        debug: options.debug || false,
        // if kit-internal tracing is enabled, we only want to wrap and instrument client-side code.
        onlyInstrumentClient: kitTracingEnabled,
      }),
    );
  }

  const sentryVitePluginsOptions = generateVitePluginOptions(mergedOptions);

  if (mergedOptions.autoUploadSourceMaps) {
    // When source maps are enabled, we need to inject the output directory to get a correct
    // stack trace, by using this SDK's `rewriteFrames` integration.
    // This integration picks up the value.
    // TODO: I don't think this is technically correct. Either we always or never inject the output directory.
    // Stack traces shouldn't be different, depending on source maps config. With debugIds, we might not even
    // need to rewrite frames anymore.
    sentryPlugins.push(await makeGlobalValuesInjectionPlugin(svelteConfig, mergedOptions));
  }

  if (sentryVitePluginsOptions) {
    const sentryVitePlugins = await makeCustomSentryVitePlugins(sentryVitePluginsOptions, svelteConfig);
    sentryPlugins.push(...sentryVitePlugins);
  }

  return sentryPlugins;
}

// A bare subpath (not a relative import) so this plugin's `resolveId` can intercept it.
const BROWSER_TRACING_VARIANT_ID = '@sentry/sveltekit/browser-tracing-variant';

/**
 * Redirects the browser-tracing variant import to the Svelte 4 (`$app/stores`) or Svelte 5
 * (`$app/state`) variant per installed SvelteKit version, so only the matching one is bundled and
 * instrumentation runs eagerly (no dynamic import).
 */
function makeBrowserTracingVariantResolverPlugin(): Plugin {
  return {
    name: 'sentry-sveltekit-browser-tracing-variant',
    enforce: 'pre',
    // Dev only: esbuild pre-bundles deps before `resolveId` runs, so exclude the SDK to let us
    // redirect the import (not needed for build).
    config(_config, { command }) {
      if (command === 'serve') {
        return { optimizeDeps: { exclude: ['@sentry/sveltekit'] } };
      }
      return undefined;
    },
    async resolveId(id) {
      if (id !== BROWSER_TRACING_VARIANT_ID) {
        return null;
      }

      const variantModule = (await isSvelteKit3(id => this.resolve(id, undefined, { skipSelf: true })))
        ? 'svelte5BrowserTracing'
        : 'svelte4BrowserTracing';

      // Point at the variant file next to the SDK's resolved entry (absolute path, so it stays internal).
      const sdkEntry = await this.resolve('@sentry/sveltekit', undefined, { skipSelf: true });
      if (!sdkEntry) {
        return null;
      }

      return path.join(path.dirname(sdkEntry.id), 'client', `${variantModule}.js`);
    },
  };
}

/**
 * Whether to use the SvelteKit 3 (`$app/state`) variant, from the installed `@sveltejs/kit` version
 * (resolved via the bundler, not `process.cwd()`).
 *
 * If the Kit version can't be read, fall back to the Svelte major and warn (never throw): Svelte < 5
 * can't be Kit 3 (use `$app/stores`); on Svelte 5 use `$app/state`, which works on both Kit 2.12+ and
 * Kit 3 — the safe direction, since `$app/stores` hard-breaks on Kit 3.
 */
async function isSvelteKit3(resolve: (id: string) => Promise<{ id: string } | null>): Promise<boolean> {
  const kitMajor = await readPackageMajor(resolve, '@sveltejs/kit/package.json');
  if (kitMajor !== undefined) {
    return kitMajor >= 3;
  }

  const svelteMajor = await readPackageMajor(resolve, 'svelte/package.json');
  const useKit3Variant = svelteMajor === undefined || svelteMajor >= 5;
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      "[@sentry/sveltekit] Couldn't read the installed `@sveltejs/kit` version to set up browser " +
        `tracing; falling back to the Svelte ${svelteMajor ?? '?'} based variant ` +
        `(${useKit3Variant ? '`$app/state`' : '`$app/stores`'}). ` +
        'If browser tracing misbehaves, please report this to the Sentry SDK team.',
    );
  });
  return useKit3Variant;
}

async function readPackageMajor(
  resolve: (id: string) => Promise<{ id: string } | null>,
  packageJsonId: string,
): Promise<number | undefined> {
  try {
    const resolved = await resolve(packageJsonId);
    if (resolved) {
      const { version } = JSON.parse(fs.readFileSync(resolved.id, 'utf8')) as { version: string };
      const major = parseInt(version.split('.')[0] || '', 10);
      if (!Number.isNaN(major)) {
        return major;
      }
    }
  } catch {
    // ignore — caller handles the `undefined` case
  }
  return undefined;
}

/**
 * This function creates the options for the custom Sentry Vite plugin.
 * The options are derived from the Sentry SvelteKit plugin options, where the `_unstable` options take precedence.
 *
 * only exported for testing
 */
export function generateVitePluginOptions(
  svelteKitPluginOptions: SentrySvelteKitPluginOptions,
): CustomSentryVitePluginOptions | null {
  let sentryVitePluginsOptions: CustomSentryVitePluginOptions | null = null;

  // Bundle Size Optimizations
  if (svelteKitPluginOptions.bundleSizeOptimizations) {
    sentryVitePluginsOptions = {
      bundleSizeOptimizations: {
        ...svelteKitPluginOptions.bundleSizeOptimizations,
      },
    };
  }

  // todo(v11): remove deprecated options (Also from options type)

  // Source Maps
  if (svelteKitPluginOptions.autoUploadSourceMaps && process.env.NODE_ENV !== 'development') {
    const {
      // eslint-disable-next-line typescript/no-deprecated
      unstable_sentryVitePluginOptions: deprecated_unstableSourceMapUploadOptions,
      ...deprecatedSourceMapUploadOptions
      // eslint-disable-next-line typescript/no-deprecated
    } = svelteKitPluginOptions.sourceMapsUploadOptions || {};

    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars,typescript/no-deprecated
      sourceMapsUploadOptions: _filtered1,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      unstable_sentryVitePluginOptions: _filtered2,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      autoUploadSourceMaps: _filtered3,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      autoInstrument: _filtered4,
      sentryUrl,
      ...newSvelteKitPluginOptions
    } = svelteKitPluginOptions;

    const { unstable_sentryVitePluginOptions } = svelteKitPluginOptions;

    sentryVitePluginsOptions = {
      ...(sentryVitePluginsOptions ? sentryVitePluginsOptions : {}),

      ...deprecatedSourceMapUploadOptions,
      ...newSvelteKitPluginOptions,

      url: sentryUrl,

      ...deprecated_unstableSourceMapUploadOptions,
      ...unstable_sentryVitePluginOptions,

      adapter: svelteKitPluginOptions.adapter,
      // override the plugin's debug flag with the one from the top-level options
      debug: svelteKitPluginOptions.debug,
    };

    // Handle sourcemaps options - merge deprecated and new, with new taking precedence
    if (
      // eslint-disable-next-line typescript/no-deprecated
      deprecatedSourceMapUploadOptions.sourcemaps ||
      svelteKitPluginOptions.sourcemaps ||
      deprecated_unstableSourceMapUploadOptions?.sourcemaps ||
      unstable_sentryVitePluginOptions?.sourcemaps
    ) {
      sentryVitePluginsOptions.sourcemaps = {
        // eslint-disable-next-line typescript/no-deprecated
        ...deprecatedSourceMapUploadOptions.sourcemaps,
        ...svelteKitPluginOptions.sourcemaps,
        // Also handle nested deprecated options from unstable plugin options
        ...deprecated_unstableSourceMapUploadOptions?.sourcemaps,
        ...unstable_sentryVitePluginOptions?.sourcemaps,
      };
    }

    // Handle release options - merge deprecated and new, with new taking precedence
    if (
      // eslint-disable-next-line typescript/no-deprecated
      deprecatedSourceMapUploadOptions.release ||
      svelteKitPluginOptions.release ||
      deprecated_unstableSourceMapUploadOptions?.release ||
      unstable_sentryVitePluginOptions?.release
    ) {
      sentryVitePluginsOptions.release = {
        // eslint-disable-next-line typescript/no-deprecated
        ...deprecatedSourceMapUploadOptions.release,
        ...svelteKitPluginOptions.release,
        // Also handle nested deprecated options from unstable plugin options
        ...deprecated_unstableSourceMapUploadOptions?.release,
        ...unstable_sentryVitePluginOptions?.release,
      };
    }
  }

  return sentryVitePluginsOptions;
}
