import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { warnOnRemovedBuildOptions } from '@sentry/core';
import { type Plugin } from 'vite';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * Create a custom subset of sentry's vite plugins
 */
export async function makeCustomSentryVitePlugins(options: SentryReactRouterBuildOptions): Promise<Plugin[]> {
  warnOnRemovedBuildOptions(options, ['unstable_sentryVitePluginOptions']);

  const {
    debug,
    bundleSizeOptimizations,
    applicationKey,
    authToken,
    errorHandler,
    headers,
    moduleMetadata,
    org,
    project,
    sentryUrl,
    silent,
    telemetry,
    reactComponentAnnotation,
    release,
  } = options;

  const sentryVitePlugins = sentryVitePlugin({
    applicationKey,
    authToken: authToken ?? process.env.SENTRY_AUTH_TOKEN,
    bundleSizeOptimizations,
    debug: debug ?? false,
    errorHandler,
    headers,
    moduleMetadata,
    org: org ?? process.env.SENTRY_ORG,
    project: project ?? process.env.SENTRY_PROJECT,
    reactComponentAnnotation,
    release,
    silent,
    telemetry: telemetry ?? true,
    // The plugin creates, finalizes and sets commits on the release in `writeBundle` regardless of
    // `sourcemaps.disable`, so self-hosted setups need the URL here too - not just on the
    // `sentryOnBuildEnd` CLI instance.
    url: sentryUrl,
    _metaOptions: {
      telemetry: {
        metaFramework: 'react-router',
      },
    },
    sourcemaps: {
      // Debug ID injection and upload are handled by the `sentryOnBuildEnd` hook, so the Vite plugin
      // must never do it as well - that would inject a second debug ID per chunk and break source
      // map resolution.
      disable: true,
      // The plugin deletes these in a `finally` block that runs regardless of `disable`, which would
      // remove the maps before `sentryOnBuildEnd` gets to upload them. Deletion happens there instead.
      filesToDeleteAfterUpload: undefined,
    },
  }) as Plugin[];

  return sentryVitePlugins;
}
