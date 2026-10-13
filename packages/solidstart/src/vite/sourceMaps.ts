import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import type { Plugin, UserConfig } from 'vite';
import type { SentrySolidStartOptions } from './sentrySolidStart';
import type { SentrySolidStartPluginOptions } from './types';

// `debug` is all the source map setting logic needs, and all the two majors' option types share.
type SourceMapSettingOptions = { debug?: boolean };

type FilesToDeleteAfterUpload = string | string[] | undefined;

/**
 * A Sentry plugin for adding the @sentry/bundler-plugins/vite plugin to automatically upload source maps to Sentry.
 */
export function makeAddSentryVitePlugin(options: SentrySolidStartPluginOptions, viteConfig: UserConfig): Plugin[] {
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

  let updatedFilesToDeleteAfterUpload: string[] | undefined = undefined;

  if (
    typeof sourcemaps?.filesToDeleteAfterUpload === 'undefined' &&
    // Only if source maps were previously not set, we update the "filesToDeleteAfterUpload" (as we override the setting with "hidden")
    typeof viteConfig.build?.sourcemap === 'undefined'
  ) {
    // For .output, .vercel, .netlify etc.
    updatedFilesToDeleteAfterUpload = ['.*/**/*.map'];

    debug &&
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Automatically setting \`sourcemaps.filesToDeleteAfterUpload: ${JSON.stringify(
          updatedFilesToDeleteAfterUpload,
        )}\` to delete generated source maps after they were uploaded to Sentry.`,
      );
  }

  return [
    ...sentryVitePlugin({
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
        filesToDeleteAfterUpload: sourcemaps?.filesToDeleteAfterUpload ?? updatedFilesToDeleteAfterUpload,
      },
      _metaOptions: {
        telemetry: {
          metaFramework: 'solidstart',
        },
      },
    }),
  ];
}

/**
 * SolidStart 2 counterpart of `makeAddSentryVitePlugin`, reading the flat `BuildTimeOptionsBase`
 * fields rather than the nested `sourceMapsUploadOptions`.
 *
 * Covers the Vite-built client assets only; Nitro emits the server bundle outside Vite's output dir
 * and the Sentry Nitro module uploads that.
 */
export function makeAddSentryVitePluginSolidStart2(options: SentrySolidStartOptions): Plugin[] {
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

  // Deferred because the default depends on whether the user set `build.sourcemap` themselves,
  // which is only known once Vite resolves its config.
  let resolveFilesToDeleteAfterUpload:
    | ((value: FilesToDeleteAfterUpload | PromiseLike<FilesToDeleteAfterUpload>) => void)
    | undefined;
  const filesToDeleteAfterUploadPromise = new Promise<FilesToDeleteAfterUpload>(resolve => {
    resolveFilesToDeleteAfterUpload = resolve;
  });

  const configPlugin: Plugin = {
    name: 'sentry-solidstart-files-to-delete-after-upload',
    apply: 'build',
    enforce: 'post',
    config(config) {
      const userFilesToDelete = sourcemaps?.filesToDeleteAfterUpload;

      // Only clean up source maps we turned on ourselves.
      if (typeof userFilesToDelete === 'undefined' && typeof config.build?.sourcemap === 'undefined') {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(
            '[Sentry] Automatically setting `sourcemaps.filesToDeleteAfterUpload: ["./**/*.map"]` to delete generated source maps after they were uploaded to Sentry.',
          );
        }
        resolveFilesToDeleteAfterUpload?.(['./**/*.map']);
      } else {
        resolveFilesToDeleteAfterUpload?.(userFilesToDelete);
      }
    },
  };

  const sentryPlugins = sentryVitePlugin({
    ...passthroughOptions,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    debug: debug ?? false,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    telemetry: telemetry ?? true,
    url: sentryUrl,
    sourcemaps: {
      ...sourcemaps,
      filesToDeleteAfterUpload: filesToDeleteAfterUploadPromise,
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'solidstart',
      },
    },
  });

  return [configPlugin, ...sentryPlugins];
}

/**
 * A Sentry plugin for SolidStart to enable "hidden" source maps if they are unset. Used by both
 * SolidStart majors.
 */
export function makeEnableSourceMapsVitePlugin(options: SourceMapSettingOptions): Plugin[] {
  return [
    {
      name: 'sentry-solidstart-update-source-map-setting',
      apply: 'build',
      enforce: 'post',
      config(viteConfig) {
        // Return only what changed: Vite concatenates arrays when merging a `config` return value,
        // so echoing the whole config back would duplicate every array the user had.
        return {
          build: {
            sourcemap: getUpdatedSourceMapSettings(viteConfig, options),
          },
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
 *       - configure `filesToDeleteAfterUpload` to delete all .map files (we emit a log about this)
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
