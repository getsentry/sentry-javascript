import { applySdkMetadata, flush, getGlobalScope } from '@sentry/core';
import { type NodeOptions, httpIntegration, init as initNode } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations } from '@sentry/node/build/types/sdk';
import type { Client, EventProcessor, Integration } from '@sentry/types';
import { logger, vercelWaitUntil } from '@sentry/utils';
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
    defaultIntegrations: getNuxtDefaultIntegrations(options),
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

function getNuxtDefaultIntegrations(options: NodeOptions): Integration[] {
  return [
    ...getDefaultNodeIntegrations(options).filter(integration => integration.name !== 'Http'),
    // The httpIntegration is added as defaultIntegration, so users can still overwrite it
    httpIntegration({
      instrumentation: {
        responseHook: () => {
          // Makes it possible to end the tracing span before closing the Vercel lambda (https://vercel.com/docs/functions/functions-api-reference#waituntil)
          vercelWaitUntil(flushSafelyWithTimeout());
        },
      },
    }),
  ];
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

/**
 * Flushes pending Sentry events with a 2-second timeout and in a way that cannot create unhandled promise rejections.
 */
export async function flushSafelyWithTimeout(): Promise<void> {
  try {
    DEBUG_BUILD && logger.log('Flushing events...');
    await flush(2000);
    DEBUG_BUILD && logger.log('Done flushing events');
  } catch (e) {
    DEBUG_BUILD && logger.log('Error while flushing events:\n', e);
  }
}
