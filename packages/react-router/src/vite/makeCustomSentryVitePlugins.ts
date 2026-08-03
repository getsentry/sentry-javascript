import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
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
    applicationKey,
    authToken,
    org,
    project,
    telemetry,
    reactComponentAnnotation,
    release,
  } = options;

  const unstableSourcemapsDisable = unstable_sentryVitePluginOptions?.sourcemaps?.disable;

  // Any value other than `true` asks the Vite plugin to inject debug IDs, which the
  // `sentryOnBuildEnd` hook already does - so it is ignored rather than honoured.
  if (unstableSourcemapsDisable !== undefined && unstableSourcemapsDisable !== true) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Ignoring \`unstable_sentryVitePluginOptions.sourcemaps.disable: ${JSON.stringify(
        unstableSourcemapsDisable,
      )}\`. Debug ID injection and source map upload are handled by the \`sentryOnBuildEnd\` hook for React Router; letting the Vite plugin do it as well injects a second debug ID per chunk and breaks source map resolution. Remove the option, or set \`sourcemaps.disable: true\` at the top level to opt out of Sentry source maps entirely.`,
    );
  }

  const sentryVitePlugins = sentryVitePlugin({
    applicationKey,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    telemetry: telemetry ?? true,
    // Spread here so it can override the plain options above, but not the objects
    // merged below - object spread replaces whole keys rather than deep-merging.
    ...unstable_sentryVitePluginOptions,
    _metaOptions: {
      ...unstable_sentryVitePluginOptions?._metaOptions,
      telemetry: {
        ...unstable_sentryVitePluginOptions?._metaOptions?.telemetry,
        metaFramework: 'react-router',
      },
    },
    reactComponentAnnotation: {
      // Only assign when set, as an explicit `undefined` would erase the unstable value
      ...(reactComponentAnnotation?.enabled !== undefined && { enabled: reactComponentAnnotation.enabled }),
      ...(reactComponentAnnotation?.ignoredComponents !== undefined && {
        ignoredComponents: reactComponentAnnotation.ignoredComponents,
      }),
      ...unstable_sentryVitePluginOptions?.reactComponentAnnotation,
    },
    release: {
      ...unstable_sentryVitePluginOptions?.release,
      ...release,
    },
    sourcemaps: {
      ...unstable_sentryVitePluginOptions?.sourcemaps,
      // Injection and upload are handled in the buildEnd hook, so the Vite plugin must
      // never do it too. This is deliberately not overridable - see the warning above.
      disable: true,
    },
  }) as Plugin[];

  return sentryVitePlugins;
}
