import { sentryVitePlugin } from '@sentry/vite-plugin';
import { type Plugin } from 'vite';
import type { SentryReactRouterPluginOptions } from './types';

/**
 * Create a custom subset of sentry's vite plugins
 */
export async function makeCustomSentryVitePlugins(options: SentryReactRouterPluginOptions): Promise<Plugin[]> {
  const {
    debug,
    sourceMapsUploadOptions,
    unstable_sentryVitePluginOptions,
    bundleSizeOptimizations,
    authToken,
    org,
    project,
  } = options;

  const sentryVitePlugins = sentryVitePlugin({
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    telemetry: sourceMapsUploadOptions?.telemetry ?? true,
    _metaOptions: {
      telemetry: {
        metaFramework: 'react-router',
      },
    },

    ...unstable_sentryVitePluginOptions,
  }) as Plugin[];

  // only use a subset of the plugins as all upload and file deletion tasks will be handled in the buildEnd hook
  return [
    ...sentryVitePlugins.filter(plugin => {
      return [
        'sentry-telemetry-plugin',
        'sentry-vite-release-injection-plugin',
        'sentry-vite-debug-id-injection-plugin',
      ].includes(plugin.name);
    }),
  ];
}
