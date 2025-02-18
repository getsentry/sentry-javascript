import { consoleSandbox } from '@sentry/core';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { loadConfigFromFile, type Plugin, type UserConfig } from 'vite';
import type { SentryReactRouterPluginOptions } from './types';

/**
 * Creates sentry's vite plugins
 */
export async function makeSentryVitePlugins(options: SentryReactRouterPluginOptions): Promise<Plugin[]> {
  const {
    debug,
    sourceMapsUploadOptions,
    unstable_sentryVitePluginOptions,
    bundleSizeOptimizations,
    authToken,
    org,
    project,
  } = options;

  let updatedFilesToDeleteAfterUpload: string[] | undefined = undefined;

  let loadedConfig: { path: string; config: UserConfig; dependencies: string[] } | null = null;

  try {
    loadedConfig = await loadConfigFromFile({ mode: 'production', command: 'build' });
  } catch (error) {
    if (debug) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log('[Sentry] could not load Vite config during build');
      });
    }
  }

  if (
    typeof sourceMapsUploadOptions?.filesToDeleteAfterUpload === 'undefined' &&
    typeof unstable_sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload === 'undefined' &&
    // Only if source maps were previously not set, we update the "filesToDeleteAfterUpload" (as we override the setting with "hidden")
    typeof loadedConfig?.config.build?.sourcemap === 'undefined'
  ) {
    // For .output, .vercel, .netlify etc.
    updatedFilesToDeleteAfterUpload = ['.*/**/*.map'];

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Automatically setting \`sourceMapsUploadOptions.filesToDeleteAfterUpload: ${JSON.stringify(
          updatedFilesToDeleteAfterUpload,
        )}\` to delete generated source maps after they were uploaded to Sentry.`,
      );
    });
  }

  return [
    ...sentryVitePlugin({
      authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
      bundleSizeOptimizations,
      debug: debug ?? false,
      org: org ?? process.env.SENTRY_ORG,
      project: project ?? process.env.SENTRY_PROJECT,
      sourcemaps: {
        filesToDeleteAfterUpload:
          (sourceMapsUploadOptions?.filesToDeleteAfterUpload ||
            unstable_sentryVitePluginOptions?.sourcemaps?.filesToDeleteAfterUpload) ??
          updatedFilesToDeleteAfterUpload,
        ...unstable_sentryVitePluginOptions?.sourcemaps,
      },
      telemetry: sourceMapsUploadOptions?.telemetry ?? true,
      _metaOptions: {
        telemetry: {
          metaFramework: 'react-router',
        },
      },

      ...unstable_sentryVitePluginOptions,
    }),
  ];
}
