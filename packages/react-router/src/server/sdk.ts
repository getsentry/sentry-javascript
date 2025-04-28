import type { Integration } from '@sentry/core';
import { applySdkMetadata, logger, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations, init as initNodeSdk } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { reactRouterServerIntegration } from './integration/reactRouterServer';

/**
 * Initializes the server side of the React Router SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts: NodeOptions = {
    defaultIntegrations: [...getDefaultReactRouterServerIntegrations(options)],
    ...options,
  };

  DEBUG_BUILD && logger.log('Initializing SDK...');

  applySdkMetadata(opts, 'react-router', ['react-router', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  DEBUG_BUILD && logger.log('SDK successfully initialized');
  return client;
}

/**
 * Returns the default integrations for the React Router SDK.
 * @param options The options for the SDK.
 */
export function getDefaultReactRouterServerIntegrations(options: NodeOptions): Integration[] {
  return [...getDefaultIntegrations(options), reactRouterServerIntegration()];
}
