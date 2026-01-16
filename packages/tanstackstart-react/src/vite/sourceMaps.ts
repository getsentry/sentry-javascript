import type { BuildTimeOptionsBase } from '@sentry/core';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin, UserConfig } from 'vite';

type FilesToDeleteAfterUpload = string | string[] | undefined;

/**
 * A Sentry plugin for adding the @sentry/vite-plugin to automatically upload source maps to Sentry.
 */
export function makeAddSentryVitePlugin(options: BuildTimeOptionsBase): Plugin[] {
  const {
    authToken,
    bundleSizeOptimizations,
    debug,
    errorHandler,
    headers,
    org,
    project,
    release,
    sentryUrl,
    silent,
    sourcemaps,
    telemetry,
  } = options;

  // defer resolving the filesToDeleteAfterUpload until we got access to the Vite config
  let resolveFilesToDeleteAfterUpload: ((value: FilesToDeleteAfterUpload) => void) | undefined;
  const filesToDeleteAfterUploadPromise = new Promise<FilesToDeleteAfterUpload>(resolve => {
    resolveFilesToDeleteAfterUpload = resolve;
  });

  const configPlugin: Plugin = {
    name: 'sentry-tanstackstart-files-to-delete-after-upload-plugin',
    apply: 'build',
    enforce: 'post',
    config(config) {
      const userFilesToDelete = sourcemaps?.filesToDeleteAfterUpload;

      // Only auto-delete source maps if the user didn't configure sourcemaps at all
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
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations: bundleSizeOptimizations ?? undefined,
    debug: debug ?? false,
    errorHandler,
    headers,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    release,
    silent,
    sourcemaps: {
      assets: sourcemaps?.assets,
      disable: sourcemaps?.disable,
      ignore: sourcemaps?.ignore,
      filesToDeleteAfterUpload: filesToDeleteAfterUploadPromise,
    },
    telemetry: telemetry ?? true,
    url: sentryUrl,
    _metaOptions: {
      telemetry: {
        metaFramework: 'tanstackstart-react',
      },
    },
  });

  return [configPlugin, ...sentryPlugins];
}

/**
 * A Sentry plugin for TanStack Start React to enable "hidden" source maps if they are unset.
 */
export function makeEnableSourceMapsVitePlugin(options: BuildTimeOptionsBase): Plugin[] {
  return [
    {
      name: 'sentry-tanstackstart-react-source-maps',
      apply: 'build',
      enforce: 'post',
      config(viteConfig) {
        return {
          ...viteConfig,
          build: {
            ...viteConfig.build,
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
  sentryPluginOptions?: BuildTimeOptionsBase,
): boolean | 'inline' | 'hidden' {
  viteConfig.build = viteConfig.build || {};

  const viteUserSourceMapSetting = viteConfig.build?.sourcemap;
  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  // Respect user source map setting if it is explicitly set
  if (viteUserSourceMapSetting === false) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your TanStack Start configuration (\`${settingKey}: false\`). Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your TanStack Start configuration.');
    }

    return viteUserSourceMapSetting;
  } else if (viteUserSourceMapSetting && ['hidden', 'inline', true].includes(viteUserSourceMapSetting)) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteUserSourceMapSetting.toString()}\`. Sentry will keep this source map setting.`,
      );
    }

    return viteUserSourceMapSetting;
  }

  // If the user did not specify a source map setting, we enable 'hidden' by default
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
    );
  }

  return 'hidden';
}
