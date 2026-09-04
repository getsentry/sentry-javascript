import * as path from 'node:path';
import type { Client, Event, EventProcessor } from '@sentry/core';
import {
  applySdkMetadata,
  consoleSandbox,
  debug,
  DEFAULT_ENVIRONMENT,
  DEV_ENVIRONMENT,
  getClient,
  getGlobalScope,
} from '@sentry/core';
import { init as initNode } from '@sentry/node';
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
  if (isNuxtServerInitialized()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] The Sentry server SDK is already initialized, skipping a second initialization. The Sentry server config is bundled into the Nitro server build, so a `node --import` preload of the config file is no longer needed and can be removed.',
      );
    });
    return getClient();
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
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'node']);

  const client = initNode(sentryOptions);

  if (client) {
    markNuxtServerInitialized();
  }

  getGlobalScope().addEventProcessor(lowQualityTransactionsFilter(options));
  getGlobalScope().addEventProcessor(clientSourceMapErrorFilter(options));

  return client;
}

/**
 * Filter out transactions for resource requests which we don't want to send to Sentry
 * for quota reasons.
 *
 * Only exported for testing
 */
export function lowQualityTransactionsFilter(options: SentryNuxtServerOptions): EventProcessor {
  return Object.assign(
    (event => {
      if (event.type !== 'transaction' || !event.transaction || isCacheEvent(event)) {
        return event;
      }

      // Check if this looks like a parametrized route (contains :param or :param() patterns)
      const hasRouteParameters = /\/:[^(/\s]*(\([^)]*\))?[^/\s]*/.test(event.transaction);

      if (hasRouteParameters) {
        return event;
      }

      // We don't want to send transaction for file requests, so everything ending with a *.someExtension should be filtered out
      // path.extname will return an empty string for normal page requests
      if (path.extname(event.transaction)) {
        options.debug &&
          DEBUG_BUILD &&
          debug.log('NuxtLowQualityTransactionsFilter filtered transaction: ', event.transaction);
        return null;
      }
      return event;
    }) satisfies EventProcessor,
    { id: 'NuxtLowQualityTransactionsFilter' },
  );
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

/**
 * Checks if the event is a cache event.
 */
function isCacheEvent(e: Event): boolean {
  return e.contexts?.trace?.origin === 'auto.cache.nuxt';
}
