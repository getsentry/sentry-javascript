import { applySdkMetadata, logger, SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { SENTRY_PARAMETERIZED_ROUTE } from './attributes';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';

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

  client?.on('preprocessEvent', event => {
    if (event.type === 'transaction' && event.transaction) {
      // Check if the transaction name matches an HTTP method with a wildcard route (e.g. "GET *")
      if (event.transaction.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT) \*$/)) {
        const traceData = event.contexts?.trace?.data;
        if (traceData) {
          // Get the parameterized route that was stored earlier by our wrapped handler (e.g. "/users/:id")
          const paramRoute = traceData[SENTRY_PARAMETERIZED_ROUTE];
          if (paramRoute) {
            traceData[ATTR_HTTP_ROUTE] = paramRoute;
            const method = traceData[SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD] || traceData['http.method'];
            if (method) {
              event.transaction = `${method} ${paramRoute}`;
            }
          }
        }
      }
    }
  });

  DEBUG_BUILD && logger.log('SDK successfully initialized');
  return client;
}
