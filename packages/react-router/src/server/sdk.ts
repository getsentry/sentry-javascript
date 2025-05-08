import type { Integration } from '@sentry/core';
import { applySdkMetadata, logger, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getNodeDefaultIntegrations, init as initNodeSdk } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { lowQualityTransactionsFilterIntegration } from './lowQualityTransactionsFilterIntegration';

function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [...getNodeDefaultIntegrations(options), lowQualityTransactionsFilterIntegration(options)];
}

/**
 * Initializes the server side of the React Router SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
    defaultIntegrations: getDefaultIntegrations(options),
  };

  DEBUG_BUILD && logger.log('Initializing SDK...');

  applySdkMetadata(opts, 'react-router', ['react-router', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  DEBUG_BUILD && logger.log('SDK successfully initialized');

  return client;
}
