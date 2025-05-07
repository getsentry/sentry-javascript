import { type EventProcessor, applySdkMetadata, getGlobalScope, logger, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';

/**
 * Initializes the server side of the React Router SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
  };

  DEBUG_BUILD && logger.log('Initializing SDK...');

  applySdkMetadata(opts, 'react-router', ['react-router', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  DEBUG_BUILD && logger.log('SDK successfully initialized');

  getGlobalScope().addEventProcessor(lowQualityTransactionsFilter(options));

  return client;
}

const matchedRegexes = [/GET \/node_modules\//, /GET \/favicon\.ico/, /GET \/@id\//];

/**
 * Filters out noisy transactions such as requests to node_modules, favicon.ico, @id/
 *
 * @param options The NodeOptions passed to the SDK
 * @returns An EventProcessor that filters low-quality transactions
 */
export function lowQualityTransactionsFilter(options: NodeOptions): EventProcessor {
  return Object.assign(
    (event => {
      if (event.type !== 'transaction' || !event.transaction) {
        return event;
      }

      if (matchedRegexes.some(regex => event.transaction?.match(regex))) {
        options.debug && logger.log('[ReactRouter] Filtered node_modules transaction:', event.transaction);
        return null;
      }

      return event;
    }) satisfies EventProcessor,
    { id: 'ReactRouterLowQualityTransactionsFilter' },
  );
}
