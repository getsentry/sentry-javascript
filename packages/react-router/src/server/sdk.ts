import type { Integration } from '@sentry/core';
import { applySdkMetadata, debug, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getNodeDefaultIntegrations, init as initNodeSdk } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { reactRouterServerIntegration } from './integration/reactRouterServer';

/**
 * Returns the default integrations for the React Router SDK.
 * @param options The options for the SDK.
 */
export function getDefaultReactRouterServerIntegrations(options: NodeOptions): Integration[] {
  return [...getNodeDefaultIntegrations(options), reactRouterServerIntegration()];
}

const LOW_QUALITY_TRANSACTIONS_REGEXES = [
  /GET \/node_modules\//,
  /GET \/favicon\.ico/,
  /GET \/@id\//,
  /GET \/__manifest\?/,
];

/**
 * Initializes the server side of the React Router SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts: NodeOptions = {
    ...options,
    defaultIntegrations: getDefaultReactRouterServerIntegrations(options),
  };

  opts.ignoreSpans = [...(opts.ignoreSpans || []), ...LOW_QUALITY_TRANSACTIONS_REGEXES];

  DEBUG_BUILD && debug.log('Initializing SDK...');

  applySdkMetadata(opts, 'react-router', ['react-router', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  DEBUG_BUILD && debug.log('SDK successfully initialized');

  return client;
}
