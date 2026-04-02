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
    ...unstable_sentryVitePluginOptions,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    telemetry: telemetry ?? true,
    _metaOptions: {
      ...unstable_sentryVitePluginOptions?._metaOptions,
      telemetry: {
        ...unstable_sentryVitePluginOptions?._metaOptions?.telemetry,
        metaFramework: 'react-router',
      },
    },
    reactComponentAnnotation: {
      ...unstable_sentryVitePluginOptions?.reactComponentAnnotation,
      enabled: reactComponentAnnotation?.enabled ?? undefined,
      ignoredComponents: reactComponentAnnotation?.ignoredComponents ?? undefined,
    },
    release: {
      ...unstable_sentryVitePluginOptions?.release,
      ...release,
    },
    // will be handled in buildEnd hook
    sourcemaps: {
      ...unstable_sentryVitePluginOptions?.sourcemaps,
      disable: true,
    },
  }) as Plugin[];

  return sentryVitePlugins;
}
