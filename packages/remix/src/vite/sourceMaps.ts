import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
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
      ignore: sourcemaps?.ignore,
      rewriteSources: sourcemaps?.rewriteSources,
      resolveSourceMap: sourcemaps?.resolveSourceMap,
      filesToDeleteAfterUpload: sourcemaps?.filesToDeleteAfterUpload,
      // Called when the bundler plugin decides, after `makeEnableSourceMapsPlugin` ran.
      // With `disable: 'disable-upload'` the user uploads the maps by hand, so they stay.
      deleteSourcemapsAfterUpload: () =>
        sourcemaps?.deleteSourcemapsAfterUpload ??
        (state.sdkEnabledSourceMaps && !sourcemaps?.disable ? true : undefined),
      sdkEnabledSourceMaps: () => state.sdkEnabledSourceMaps,
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
      return {
        build: { sourcemap },
      };
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
 *       - we enable 'hidden' source maps generation
 *       - pass `deleteSourcemapsAfterUpload: true`, so the maps never reach the build output
 *
 * --> only exported for testing
 */
export function getUpdatedSourceMapSettings(
  viteConfig: UserConfig,
  sentryPluginOptions?: SentryRemixVitePluginOptions,
): boolean | 'inline' | 'hidden' {
  const viteUserSourceMapSetting = viteConfig.build?.sourcemap;
  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  if (viteUserSourceMapSetting === false) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your Vite configuration (\`${settingKey}: false\`). Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your Vite configuration.');
    }

    return viteUserSourceMapSetting;
  }

  if (viteUserSourceMapSetting && ['hidden', 'inline', true].includes(viteUserSourceMapSetting)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteUserSourceMapSetting.toString()}\`. Sentry will keep this source map setting.`,
      );
    }

    return viteUserSourceMapSetting;
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
    );
  }

  return 'hidden';
}
