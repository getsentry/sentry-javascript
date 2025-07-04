import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { EventProcessor, Integration } from '@sentry/core';
import { applySdkMetadata, getGlobalScope, logger, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getNodeDefaultIntegrations, init as initNodeSdk, NODE_VERSION } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE } from './instrumentation/util';
import { lowQualityTransactionsFilterIntegration } from './integration/lowQualityTransactionsFilterIntegration';
import { reactRouterServerIntegration } from './integration/reactRouterServer';

/**
 * Returns the default integrations for the React Router SDK.
 * @param options The options for the SDK.
 */
export function getDefaultReactRouterServerIntegrations(options: NodeOptions): Integration[] {
  const integrations = [...getNodeDefaultIntegrations(options), lowQualityTransactionsFilterIntegration(options)];

  if (
    (NODE_VERSION.major === 20 && NODE_VERSION.minor < 19) || // https://nodejs.org/en/blog/release/v20.19.0
    (NODE_VERSION.major === 22 && NODE_VERSION.minor < 12) // https://nodejs.org/en/blog/release/v22.12.0
  ) {
    integrations.push(reactRouterServerIntegration());
  }

  return integrations;
}

/**
 * Initializes the server side of the React Router SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts: NodeOptions = {
    ...options,
    defaultIntegrations: getDefaultReactRouterServerIntegrations(options),
  };

  DEBUG_BUILD && logger.log('Initializing SDK...');

  applySdkMetadata(opts, 'react-router', ['react-router', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  // Overwrite the transaction name for instrumented data loaders because the trace data gets overwritten at a later point.
  // We only update the tx in case SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE got set in our instrumentation before.
  getGlobalScope().addEventProcessor(
    Object.assign(
      (event => {
        const overwrite = event.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE];
        if (
          event.type === 'transaction' &&
          (event.transaction === 'GET *' || event.transaction === 'POST *') &&
          event.contexts?.trace?.data?.[ATTR_HTTP_ROUTE] === '*' &&
          overwrite
        ) {
          event.transaction = overwrite;
          event.contexts.trace.data[ATTR_HTTP_ROUTE] = 'url';
        }

        // always yeet this attribute into the void, as this should not reach the server
        delete event.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE];

        return event;
      }) satisfies EventProcessor,
      { id: 'ReactRouterTransactionEnhancer' },
    ),
  );

  DEBUG_BUILD && logger.log('SDK successfully initialized');

  return client;
}
