import { hasSourceMapUploadCredentials } from '@sentry/bundler-plugins/core';
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { resolveSourceMapsFeatures } from '@sentry/core';
import type { Plugin, UserConfig } from 'vite';
import type { SentryRemixVitePluginOptions } from './types';

/** Shared by the two plugins of one build. */
export type SourceMapState = {
  /** The SDK turned on hidden source maps because the user did not set `build.sourcemap`. */
  sdkEnabledSourceMaps: boolean;
};

/**
 * Adds the Sentry bundler plugin, which injects debug IDs and uploads source maps to Sentry.
 */
export function makeAddSentryVitePlugin(
  options: SentryRemixVitePluginOptions,
  state: SourceMapState = { sdkEnabledSourceMaps: false },
): Plugin[] {
  const {
    applicationKey,
    authToken,
    bundleSizeOptimizations,
    debug,
    errorHandler,
    headers,
    moduleMetadata,
    org,
    project,
    release,
    sentryUrl,
    silent,
    sourcemaps,
    telemetry,
  } = options;

  return sentryVitePlugin({
    applicationKey,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    errorHandler,
    headers,
    moduleMetadata,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    release,
    silent,
    sourcemaps: {
      assets: sourcemaps?.assets,
      disable: sourcemaps?.disable,
      upload: sourcemaps?.upload,
      injectDebugIds: sourcemaps?.injectDebugIds,
      delete: sourcemaps?.delete,
      ignore: sourcemaps?.ignore,
      rewriteSources: sourcemaps?.rewriteSources,
      resolveSourceMap: sourcemaps?.resolveSourceMap,
      filesToDeleteAfterUpload: sourcemaps?.filesToDeleteAfterUpload,
      // Called when the bundler plugin decides, after `makeEnableSourceMapsPlugin` ran.
      // Without an upload the user uploads the maps by hand, so they stay.
      // The SDK never read the user's `deleteSourcemapsAfterUpload`. `delete` replaces it.
      // A user's own `filesToDeleteAfterUpload` replaces the SDK's deletion.
      sdkDeleteSourceMaps:
        sourcemaps?.delete === undefined && sourcemaps?.filesToDeleteAfterUpload === undefined
          ? () => (state.sdkEnabledSourceMaps && resolveSourceMapsFeatures(sourcemaps).upload ? true : undefined)
          : undefined,
    },
    telemetry: telemetry ?? true,
    url: sentryUrl,
    _metaOptions: {
      telemetry: {
        metaFramework: 'remix',
      },
    },
  });
}

/**
 * Enables "hidden" source maps if the user did not configure them.
 */
export function makeEnableSourceMapsPlugin(
  options: SentryRemixVitePluginOptions,
  state: SourceMapState = { sdkEnabledSourceMaps: false },
): Plugin {
  return {
    name: 'sentry-remix-update-source-map-setting',
    apply: 'build',
    enforce: 'post',
    // Returning only the changed key: Vite concatenates arrays when merging a `config` return
    // value, so echoing the whole config back duplicates `ssr.noExternal`, `resolve.alias` etc.
    config(viteConfig) {
      const sourcemap = getUpdatedSourceMapSettings(viteConfig, options);
      state.sdkEnabledSourceMaps = sourcemap !== viteConfig.build?.sourcemap;
      return sourcemap === undefined ? {} : { build: { sourcemap } };
    },
  };
}

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-javascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - we won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline').
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation when Sentry uploads the maps, or when
 *         `sourcemaps.delete: false` keeps them for a manual upload. Otherwise we leave it unset
 *       - without `sourcemaps.delete` we pass `sdkDeleteSourceMaps: true`, so the maps never
 *         reach the build output
 *
 * --> only exported for testing
 */
export function getUpdatedSourceMapSettings(
  viteConfig: UserConfig,
  sentryPluginOptions?: SentryRemixVitePluginOptions,
): boolean | 'inline' | 'hidden' | undefined {
  const viteUserSourceMapSetting = viteConfig.build?.sourcemap;
  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  if (viteUserSourceMapSetting === false) {
    if (debug) {
      console.warn(
        `[Sentry] Source map generation is currently disabled in your Vite configuration (\`${settingKey}: false\`). Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      console.warn('[Sentry] Source map generation is disabled in your Vite configuration.');
    }

    return viteUserSourceMapSetting;
  }

  if (viteUserSourceMapSetting && ['hidden', 'inline', true].includes(viteUserSourceMapSetting)) {
    if (debug) {
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteUserSourceMapSetting.toString()}\`. Sentry will keep this source map setting.`,
      );
    }

    return viteUserSourceMapSetting;
  }

  const sourcemaps = sentryPluginOptions?.sourcemaps;
  const { injectDebugIds, upload, legacyDisable } = resolveSourceMapsFeatures(sourcemaps);

  // Without an upload, Sentry only turns source maps on when `sourcemaps.delete: false` keeps them.
  // TODO(v12): Remove the `disable-upload` case along with `sourcemaps.disable`.
  if (
    !(
      (upload && hasSourceMapUploadCredentials(sentryPluginOptions)) ||
      legacyDisable === 'disable-upload' ||
      (sourcemaps?.delete === false && injectDebugIds)
    )
  ) {
    return undefined;
  }

  if (debug) {
    console.log(
      `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
    );
  }

  return 'hidden';
}
