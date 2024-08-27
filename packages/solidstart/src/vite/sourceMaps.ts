import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';
import type { SourceMapsOptions } from './types';

/**
 * A Sentry plugin for SolidStart to enable source maps and use
 * @sentry/vite-plugin to automatically upload source maps to Sentry.
 * @param {SourceMapsOptions} options
 */
export function makeSourceMapsVitePlugin(options: SourceMapsOptions): Plugin[] {
  return [
    {
      name: 'sentry-solidstart-source-maps',
      apply: 'build',
      enforce: 'post',
      config(config) {
        const sourceMapsPreviouslyNotEnabled = !config.build?.sourcemap;
        if (options.debug && sourceMapsPreviouslyNotEnabled) {
          // eslint-disable-next-line no-console
          console.log('[Sentry SolidStart Plugin] Enabling source map generation');
          if (!options.sourcemaps?.filesToDeleteAfterUpload) {
            // eslint-disable-next-line no-console
            console.warn(
              `[Sentry SolidStart PLugin] We recommend setting the \`sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload\` option to clean up source maps after uploading.
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
      org: options.org ?? process.env.SENTRY_ORG,
      project: options.project ?? process.env.SENTRY_PROJECT,
      authToken: options.authToken ?? process.env.SENTRY_AUTH_TOKEN,
      telemetry: options.telemetry ?? true,
      sourcemaps: {
        assets: options.sourcemaps?.assets ?? undefined,
        ignore: options.sourcemaps?.ignore ?? undefined,
        filesToDeleteAfterUpload: options.sourcemaps?.filesToDeleteAfterUpload ?? undefined,
      },
      _metaOptions: {
        telemetry: {
          metaFramework: 'solidstart',
        },
      },
      debug: options.debug ?? false,
    }),
  ];
}
