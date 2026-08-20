import * as path from 'node:path';
import type { Client, Event, EventProcessor } from '@sentry/core';
import { applySdkMetadata, debug, DEFAULT_ENVIRONMENT, DEV_ENVIRONMENT, getGlobalScope } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import type { SentryNuxtServerOptions } from '../common/types';

/**
 * Initializes the server-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtServerOptions): Client | undefined {
  let envFallback: string;
  /*! rollup-include-cjs-only */
  envFallback = DEFAULT_ENVIRONMENT;
  /*! rollup-include-cjs-only-end */

  /*! rollup-include-esm-only */
  envFallback = import.meta.dev ? DEV_ENVIRONMENT : DEFAULT_ENVIRONMENT;
  /*! rollup-include-esm-only-end */

  const sentryOptions = {
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? envFallback,
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'node']);

  const client = initNode(sentryOptions);

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
