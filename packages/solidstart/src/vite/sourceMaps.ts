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
        // TODO(v9): Remove this warning
        if (config.build?.sourcemap === false) {
          // eslint-disable-next-line no-console
          console.warn(
            "[Sentry SolidStart Plugin] You disabled sourcemaps with the `build.sourcemap` option. Currently, the Sentry SDK will override this option to generate sourcemaps. In future versions, the Sentry SDK will not override the `build.sourcemap` option if you explicitly disable it. If you want to generate and upload sourcemaps please set the `build.sourcemap` option to 'hidden' or undefined.",
          );
        }

        // TODO(v9): Remove this warning and print warning in case source map deletion is auto configured
        if (!sourceMapsUploadOptions?.filesToDeleteAfterUpload) {
          // eslint-disable-next-line no-console
          console.warn(
            "[Sentry SolidStart Plugin] The Sentry SDK has enabled source map generation for your SolidStart app. If you don't want to serve Source Maps to your users, either configure the `filesToDeleteAfterUpload` option with a glob to remove source maps after uploading them, or manually delete the source maps after the build. In future Sentry SDK versions source maps will be deleted automatically after uploading them.",
          );
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
