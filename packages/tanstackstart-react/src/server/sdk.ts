import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  _INTERNAL_installTunnelHooks as installTunnelHooks,
  getDefaultIntegrations as getDefaultNodeIntegrations,
  init as initNodeSdk,
} from '@sentry/node';

/**
 * Initializes the server side of the TanStack Start React SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const sentryOptions: NodeOptions = {
    defaultIntegrations: [...getDefaultNodeIntegrations(options)],
    ...options,
  };

  applySdkMetadata(sentryOptions, 'tanstackstart-react', ['tanstackstart-react', 'node']);

  sentryOptions.ignoreSpans = [
    ...(sentryOptions.ignoreSpans || []),
    /\/node_modules\//,
    /\/@id\//,
    /\/@react-refresh/,
    /\/@vite\//,
  ];

  const client = initNodeSdk(sentryOptions);
  // `tunnelRoute` enables the tunnel when the server entry loads, after this preload, so the servers and the Lambda
  // handler must be ready to answer it already.
  installTunnelHooks();

  return client;
}
