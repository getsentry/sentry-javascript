import { HTTP_REQUEST_METHOD, URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { Client, EventProcessor } from '@sentry/core';
import {
  _INTERNAL_captureOptionsSetByUser,
  applySdkMetadata,
  consoleSandbox,
  debug,
  DEFAULT_ENVIRONMENT,
  DEV_ENVIRONMENT,
  escapeStringForRegex,
  getClient,
  isClientClosed,
} from '@sentry/core';
import { init as initNode, nitroIntegration } from '@sentry/node';
import { getNuxtBuildAssetsPath, getNuxtPublicFilePaths } from '../common/buildAssets';
import { DEBUG_BUILD } from '../common/debug-build';
import {
  isNuxtDevRuntime,
  isNuxtPrerenderRuntime,
  isNuxtServerInitialized,
  markNuxtServerInitialized,
} from '../common/devMode';
import type { SentryNuxtServerOptions } from '../common/types';
import { getBuildAssetRequestFilters } from '../runtime/utils/buildAssetRequestFilters';
import { withNuxtTracingChannelIntegration } from '../runtime/utils/nuxtTracingChannelIntegration';

/**
 * Initializes the server-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtServerOptions): Client | undefined {
  // The prerenderer executes the server bundle (including nitro plugins) at build time (pollutes release health and adds build-time traces)
  if (isNuxtPrerenderRuntime()) {
    // potential follow-up: configurable with `capturePrerenderErrors`
    DEBUG_BUILD && debug.log('Detected a Nitro prerender build. Skipping Sentry server initialization.');
    return undefined;
  }

  // Since the server config is bundled into the Nitro build, a `node --import` preload of a config
  // file initializes the SDK a second time. The first init wins so a preload keeps its semantics.
  // A closed client does not count, so `close()` lets a later init set up a new one.
  const existingClient = getClient();
  if (isNuxtServerInitialized() && existingClient && !isClientClosed(existingClient)) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] The Sentry server SDK is already initialized, skipping a second initialization. The Sentry server config is bundled into the Nitro server build, so a `node --import` preload of the config file is no longer needed and can be removed.',
      );
    });
    return existingClient;
  }

  let isDevBuild = false;
  /*! rollup-include-esm-only */
  isDevBuild = !!import.meta.dev;
  /*! rollup-include-esm-only-end */

  // `import.meta.dev` is only substituted when this file itself is bundled; the generated
  // runtime-flags module sets the global flag for the (usual) externalized case.
  const envFallback = isDevBuild || isNuxtDevRuntime() ? DEV_ENVIRONMENT : DEFAULT_ENVIRONMENT;

  const userOptions = _INTERNAL_captureOptionsSetByUser(options);

  const sentryOptions = {
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? envFallback,
    ...userOptions,
    integrations: withNuxtIntegrations(userOptions.integrations),
    ignoreSpans: [
      ...(options.ignoreSpans || []),
      ...getBuildAssetRequestFilters(getNuxtBuildAssetsPath()),
      ...getPublicFileRequestFilters(),
    ],
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'node']);

  const client = initNode(sentryOptions);

  if (client) {
    markNuxtServerInitialized();
  }

  // On the client, not the global scope, so a later `init()` after
  // `close()` does not stack another copy.
  client?.addEventProcessor(clientSourceMapErrorFilter(options));

  return client;
}

/**
 * Swaps the default Nitro integration for one without middleware spans, storage spans and `Server-Timing` headers.
 * The Nuxt SDK already covers these, so with Nitro's tracing channels on, each operation would get two spans.
 * Also adds `nuxtTracingChannelIntegration`.
 *
 * It wraps `integrations` and not `defaultIntegrations`, because only `initNode` resolves the defaults correctly
 * (it also reads `SENTRY_TRACES_SAMPLE_RATE`).
 */
function withNuxtIntegrations(
  userIntegrations: SentryNuxtServerOptions['integrations'],
): NonNullable<SentryNuxtServerOptions['integrations']> {
  // Keep the SDK spans, not the channel spans. Nitro v2 has no channels, and h3 does not tell which middleware ran.
  const nuxtNitroIntegration = nitroIntegration({ middleware: false, storage: false, serverTiming: false });
  const withTracingChannelIntegration = withNuxtTracingChannelIntegration(userIntegrations);

  return defaultIntegrations =>
    withTracingChannelIntegration(
      defaultIntegrations.map(integration =>
        // The spread keeps core's default-instance flag, so a `nitroIntegration` from the user still wins.
        integration.name === nuxtNitroIntegration.name ? { ...integration, ...nuxtNitroIntegration } : integration,
      ),
    );
}

/**
 * Ignores files from `public/` that the HTTP integration's static asset filter misses, such as `.pdf` and `.txt` files.
 * Matches exact paths, because a route can share a prefix with a public dir.
 */
function getPublicFileRequestFilters(): NonNullable<SentryNuxtServerOptions['ignoreSpans']> {
  const paths = getNuxtPublicFilePaths();
  return paths.length
    ? [
        {
          op: HTTP_SERVER,
          attributes: {
            [HTTP_REQUEST_METHOD]: 'GET',
            [URL_PATH]: new RegExp(`^(?:${paths.map(escapeStringForRegex).join('|')})$`),
          },
        },
      ]
    : [];
}

/**
 * The browser devtools try to get the source maps, but as client source maps may not be available there is going to be an error (no problem for the application though).
 *
 * Only exported for testing
 */
export function clientSourceMapErrorFilter(options: SentryNuxtServerOptions): EventProcessor {
  return Object.assign(
    (event => {
      const errorMsg = event.exception?.values?.[0]?.value;
      if (errorMsg?.match(/^ENOENT: no such file or directory, open '.*\/_nuxt\/.*\.js\.map'/)) {
        options.debug && DEBUG_BUILD && debug.log('NuxtClientSourceMapErrorFilter filtered error: ', errorMsg);
        return null;
      }
      return event;
    }) satisfies EventProcessor,
    { id: 'NuxtClientSourceMapErrorFilter' },
  );
}
