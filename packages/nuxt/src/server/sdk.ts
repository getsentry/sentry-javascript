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
import { init as initNode } from '@sentry/node';
import { getNuxtBuildAssetsPath, getNuxtPublicFilePaths } from '../common/buildAssets';
import { DEBUG_BUILD } from '../common/debug-build';
import {
  isNuxtDevRuntime,
  isNuxtPrerenderRuntime,
  isNuxtServerInitialized,
  markNuxtServerInitialized,
} from '../common/devMode';
import type { SentryNuxtServerOptions } from '../common/types';

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

  const sentryOptions = {
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? envFallback,
    ..._INTERNAL_captureOptionsSetByUser(options),
    ignoreSpans: [...(options.ignoreSpans || []), ...getBuildAssetRequestFilters(), ...getPublicFileRequestFilters()],
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
 * Ignores build output that the HTTP integration's static asset filter misses, such as `.map` and `.json` files.
 * Matches `url.path`, because a span name has no path yet when `ignoreSpans` runs. A runtime `NUXT_APP_BASE_URL`
 * disables this filter, because the path comes from build-time config.
 */
function getBuildAssetRequestFilters(): NonNullable<SentryNuxtServerOptions['ignoreSpans']> {
  const buildAssetsPath = getNuxtBuildAssetsPath();
  return buildAssetsPath
    ? [{ op: HTTP_SERVER, attributes: { [URL_PATH]: new RegExp(`^${escapeStringForRegex(buildAssetsPath)}`) } }]
    : [];
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
