import { applySdkMetadata, getGlobalScope } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { Client, EventProcessor } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../common/debug-build';
import type { SentryNuxtOptions } from '../common/types';

/**
 * Initializes the server-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtOptions): Client | undefined {
  const sentryOptions = {
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'node']);

  const client = initNode(sentryOptions);

  getGlobalScope().addEventProcessor(
    Object.assign(
      (event => {
        if (event.type === 'transaction') {
          // Filter out transactions for Nuxt build assets
          // This regex matches the default path to the nuxt-generated build assets (`_nuxt`).
          // todo: the buildAssetDir could be changed in the nuxt config - change this to a more generic solution
          if (event.transaction?.match(/^GET \/_nuxt\//)) {
            options.debug &&
              DEBUG_BUILD &&
              logger.log('NuxtLowQualityTransactionsFilter filtered transaction: ', event.transaction);
            return null;
          }

          return event;
        } else {
          return event;
        }
      }) satisfies EventProcessor,
      { id: 'NuxtLowQualityTransactionsFilter' },
    ),
  );

  return client;
}
