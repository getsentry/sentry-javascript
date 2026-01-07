import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin, UserConfig } from 'vite';
import type { SentryTanstackStartReactPluginOptions } from '../config/types';

/**
 * A Sentry plugin for adding the @sentry/vite-plugin to automatically upload source maps to Sentry.
 */
export function makeAddSentryVitePlugin(
  options: SentryTanstackStartReactPluginOptions,
  viteConfig: UserConfig,
): Plugin[] {
  const { authToken, bundleSizeOptimizations, debug, org, project, sourceMapsUploadOptions } = options;

  let updatedFilesToDeleteAfterUpload: string[] | undefined = undefined;

  if (
    typeof sourceMapsUploadOptions?.filesToDeleteAfterUpload === 'undefined' &&
    // Only if source maps were previously not set, we update the "filesToDeleteAfterUpload" (as we override the setting with "hidden")
    typeof viteConfig.build?.sourcemap === 'undefined'
  ) {
    // For .output, .vercel, .netlify etc.
    updatedFilesToDeleteAfterUpload = ['.*/**/*.map'];

    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Automatically setting \`sourceMapsUploadOptions.filesToDeleteAfterUpload: ${JSON.stringify(
          updatedFilesToDeleteAfterUpload,
        )}\` to delete generated source maps after they were uploaded to Sentry.`,
      );
    }
  }

  return [
    ...sentryVitePlugin({
      authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
      bundleSizeOptimizations: bundleSizeOptimizations ?? undefined,
      debug: debug ?? false,
      org: org ?? process.env.SENTRY_ORG,
      project: project ?? process.env.SENTRY_PROJECT,
      sourcemaps: {
        filesToDeleteAfterUpload: sourceMapsUploadOptions?.filesToDeleteAfterUpload ?? updatedFilesToDeleteAfterUpload,
      },
      telemetry: sourceMapsUploadOptions?.telemetry ?? true,
      _metaOptions: {
        telemetry: {
          metaFramework: 'tanstackstart-react',
        },
      },
    }),
  ];
}

/**
 * A Sentry plugin for TanStack Start React to enable "hidden" source maps if they are unset.
 */
export function makeEnableSourceMapsVitePlugin(options: SentryTanstackStartReactPluginOptions): Plugin[] {
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
  sentryPluginOptions?: SentryTanstackStartReactPluginOptions,
): boolean | 'inline' | 'hidden' {
  viteConfig.build = viteConfig.build || {};

  const viteSourceMap = viteConfig.build.sourcemap;
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;

  if (viteSourceMap === false) {
    updatedSourceMapSetting = viteSourceMap;

    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your TanStack Start configuration (\`${settingKey}: false\`). Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your TanStack Start configuration.');
    }
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    updatedSourceMapSetting = viteSourceMap;

    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting.`,
      );
    }
  } else {
    updatedSourceMapSetting = 'hidden';

    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
      );
    }
  }

  return updatedSourceMapSetting;
}
