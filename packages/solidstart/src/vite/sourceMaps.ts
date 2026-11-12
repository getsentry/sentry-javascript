import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import type { Plugin, UserConfig } from 'vite';
import type { SentrySolidStartOptions } from './sentrySolidStart';
import type { SentrySolidStartPluginOptions } from './types';

// `debug` is all the source map setting logic needs, and all the two majors' option types share.
type SourceMapSettingOptions = { debug?: boolean };

/** Shared by the two plugins of one build. */
export type SourceMapState = {
  /** The SDK turned on hidden source maps because the user did not set `build.sourcemap`. */
  sdkEnabledSourceMaps: boolean;
};

type SourceMapsOptions = SentrySolidStartPluginOptions['sourcemaps'];

/**
 * The bundler plugin calls these when it decides, after `makeEnableSourceMapsVitePlugin` ran.
 * It passes the name of an environment with its own `build.sourcemap`, and `undefined` for the
 * top-level setting. The SDK only turns on the top-level maps: Nitro's environments get their
 * setting from Nitro, and `@sentry/nitro` handles their maps.
 *
 * With `keepWhenUploadDisabled`, maps the SDK turned on stay with `disable: 'disable-upload'`.
 */
function makeSourceMapDeletionOptions(
  sourcemaps: SourceMapsOptions,
  state: SourceMapState,
  { keepWhenUploadDisabled }: { keepWhenUploadDisabled: boolean },
): {
  deleteSourcemapsAfterUpload: (environment?: string) => boolean | undefined;
  sdkEnabledSourceMaps: (environment?: string) => boolean;
} {
  const sdkEnabledSourceMaps = (environment?: string): boolean =>
    environment === undefined && state.sdkEnabledSourceMaps;

  return {
    deleteSourcemapsAfterUpload: environment =>
      sourcemaps?.deleteSourcemapsAfterUpload ??
      (sdkEnabledSourceMaps(environment) && !(keepWhenUploadDisabled && sourcemaps?.disable) ? true : undefined),
    sdkEnabledSourceMaps,
  };
}

/**
 * A Sentry plugin for adding the @sentry/bundler-plugins/vite plugin to automatically upload source maps to Sentry.
 */
export function makeAddSentryVitePlugin(
  options: SentrySolidStartPluginOptions,
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
    telemetry: telemetry ?? true,
    url: sentryUrl,
    sourcemaps: {
      ...sourcemaps,
      ...makeSourceMapDeletionOptions(sourcemaps, state, { keepWhenUploadDisabled: false }),
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'solidstart',
      },
    },
  });
}

/**
 * SolidStart 2 counterpart of `makeAddSentryVitePlugin`, reading the flat `BuildTimeOptionsBase`
 * fields rather than the nested `sourceMapsUploadOptions`.
 *
 * Covers the Vite-built client assets only; Nitro emits the server bundle outside Vite's output dir
 * and the Sentry Nitro module uploads that.
 */
export function makeAddSentryVitePluginSolidStart2(
  options: SentrySolidStartOptions,
  state: SourceMapState = { sdkEnabledSourceMaps: false },
): Plugin[] {
  // Everything not destructured out is field-for-field what `sentryVitePlugin` accepts, so it is
  // spread through — a new shared option then reaches the plugin without editing a list here.
  const {
    authToken,
    buildTimeInstrumentation: _buildTimeInstrumentation,
    debug,
    org,
    project,
    sentryUrl,
    sourcemaps,
    telemetry,
    ...passthroughOptions
  } = options;

  return sentryVitePlugin({
    ...passthroughOptions,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    debug: debug ?? false,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    telemetry: telemetry ?? true,
    url: sentryUrl,
    sourcemaps: {
      ...sourcemaps,
      // `@sentry/nitro` keeps the server maps with `disable-upload`, so the client maps stay too.
      ...makeSourceMapDeletionOptions(sourcemaps, state, { keepWhenUploadDisabled: true }),
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'solidstart',
      },
    },
  });
}

/**
 * A Sentry plugin for SolidStart to enable "hidden" source maps if they are unset. Used by both
 * SolidStart majors.
 */
export function makeEnableSourceMapsVitePlugin(
  options: SourceMapSettingOptions,
  state: SourceMapState = { sdkEnabledSourceMaps: false },
): Plugin[] {
  return [
    {
      name: 'sentry-solidstart-update-source-map-setting',
      apply: 'build',
      enforce: 'post',
      config(viteConfig) {
        const sourcemap = getUpdatedSourceMapSettings(viteConfig, options);
        state.sdkEnabledSourceMaps = sourcemap !== viteConfig.build?.sourcemap;

        // Return only what changed: Vite concatenates arrays when merging a `config` return value,
        // so echoing the whole config back would duplicate every array the user had.
        return {
          build: { sourcemap },
        };
      },
    },
  ];
}

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-javascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - We won't upload anything
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
  sentryPluginOptions?: SourceMapSettingOptions,
): boolean | 'inline' | 'hidden' {
  const viteSourceMap = viteConfig?.build?.sourcemap;
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  if (viteSourceMap === false) {
    updatedSourceMapSetting = viteSourceMap;

    if (debug) {
      // Longer debug message with more details
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your SolidStart configuration (\`${settingKey}: false \`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your SolidStart configuration.');
    }
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    updatedSourceMapSetting = viteSourceMap;

    debug &&
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
      );
  } else {
    updatedSourceMapSetting = 'hidden';

    debug &&
      //  eslint-disable-next-line no-console
      console.log(
        `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps  will be deleted after they were uploaded to Sentry.`,
      );
  }

  return updatedSourceMapSetting;
}
