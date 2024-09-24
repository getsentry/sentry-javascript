import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * A Sentry plugin for SolidStart to enable source maps and use
 * @sentry/vite-plugin to automatically upload source maps to Sentry.
 * @param {SourceMapsOptions} options
 */
export function makeSourceMapsVitePlugin(options: SentrySolidStartPluginOptions): Plugin[] {
  const { authToken, debug, org, project, sourceMapsUploadOptions } = options;
  return [
    {
      name: 'sentry-solidstart-source-maps',
      apply: 'build',
      enforce: 'post',
      config(config) {
        const sourceMapsPreviouslyNotEnabled = !config.build?.sourcemap;
        if (debug && sourceMapsPreviouslyNotEnabled) {
          // eslint-disable-next-line no-console
          console.log('[Sentry SolidStart Plugin] Enabling source map generation');
          if (!sourceMapsUploadOptions?.filesToDeleteAfterUpload) {
            // eslint-disable-next-line no-console
            console.warn(
              `[Sentry SolidStart Plugin] We recommend setting the \`sourceMapsUploadOptions.filesToDeleteAfterUpload\` option to clean up source maps after uploading.
[Sentry SolidStart Plugin] Otherwise, source maps might be deployed to production, depending on your configuration`,
            );
          }
        }
        return {
          ...config,
          build: {
            ...config.build,
            sourcemap: true,
          },
        };
      },
    },
    ...sentryVitePlugin({
      authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
      bundleSizeOptimizations: options.bundleSizeOptimizations,
      debug: debug ?? false,
      org: org ?? process.env.SENTRY_ORG,
      project: project ?? process.env.SENTRY_PROJECT,
      sourcemaps: {
        filesToDeleteAfterUpload: sourceMapsUploadOptions?.filesToDeleteAfterUpload ?? undefined,
        ...sourceMapsUploadOptions?.unstable_sentryVitePluginOptions?.sourcemaps,
      },
      telemetry: sourceMapsUploadOptions?.telemetry ?? true,
      _metaOptions: {
        telemetry: {
          metaFramework: 'solidstart',
        },
      },
      ...sourceMapsUploadOptions?.unstable_sentryVitePluginOptions,
    }),
  ];
}
