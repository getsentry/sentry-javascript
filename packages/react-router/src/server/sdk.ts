import { applySdkMetadata, logger, setTag } from '@sentry/core';
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
  return client;
}
