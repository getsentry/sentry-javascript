import { applySdkMetadata, getGlobalScope } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { Client, EventProcessor } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../common/debug-build';
import type { SentryNuxtServerOptions } from '../common/types';

/**
 * Initializes the server-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtServerOptions): Client | undefined {
  const sentryOptions = {
    ...options,
    registerEsmLoaderHooks: mergeRegisterEsmLoaderHooks(options),
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

/**
 * Adds /vue/ to the registerEsmLoaderHooks options and merges it with the old values in the array if one is defined.
 * If the registerEsmLoaderHooks option is already a boolean, nothing is changed.
 *
 * Only exported for Testing purposes.
 */
export function mergeRegisterEsmLoaderHooks(
  options: SentryNuxtServerOptions,
): SentryNuxtServerOptions['registerEsmLoaderHooks'] {
  if (typeof options.registerEsmLoaderHooks === 'object' && options.registerEsmLoaderHooks !== null) {
    return {
      exclude: Array.isArray(options.registerEsmLoaderHooks.exclude)
        ? [...options.registerEsmLoaderHooks.exclude, /vue/]
        : options.registerEsmLoaderHooks.exclude ?? [/vue/],
    };
  }
  return options.registerEsmLoaderHooks ?? { exclude: [/vue/] };
}
