import { sentryVitePlugin } from '@sentry/vite-plugin';
import { type Plugin } from 'vite';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * Create a custom subset of sentry's vite plugins
 */
export async function makeCustomSentryVitePlugins(options: SentryReactRouterBuildOptions): Promise<Plugin[]> {
  const {
    debug,
    unstable_sentryVitePluginOptions,
    bundleSizeOptimizations,
    authToken,
    org,
    project,
    telemetry,
    reactComponentAnnotation,
    release,
  } = options;

  const sentryVitePlugins = sentryVitePlugin({
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    telemetry: telemetry ?? true,
    _metaOptions: {
      telemetry: {
        metaFramework: 'react-router',
      },
      ...unstable_sentryVitePluginOptions?._metaOptions,
    },
    reactComponentAnnotation: {
      enabled: reactComponentAnnotation?.enabled ?? undefined,
      ignoredComponents: reactComponentAnnotation?.ignoredComponents ?? undefined,
      ...unstable_sentryVitePluginOptions?.reactComponentAnnotation,
    },
    release: {
      ...unstable_sentryVitePluginOptions?.release,
      ...release,
    },
    // will be handled in buildEnd hook
    sourcemaps: {
      disable: true,
      ...unstable_sentryVitePluginOptions?.sourcemaps,
    },
    ...unstable_sentryVitePluginOptions,
  }) as Plugin[];

  // only use a subset of the plugins as all upload and file deletion tasks will be handled in the buildEnd hook
  return [
    ...sentryVitePlugins.filter(plugin => {
      return [
        'sentry-telemetry-plugin',
        'sentry-vite-injection-plugin',
        ...(reactComponentAnnotation?.enabled || unstable_sentryVitePluginOptions?.reactComponentAnnotation?.enabled
          ? ['sentry-vite-component-name-annotate-plugin']
          : []),
      ].includes(plugin.name);
    }),
  ];
}
