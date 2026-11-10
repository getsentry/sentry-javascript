import { _INTERNAL_getActiveClient as getActiveClient, applySdkMetadata, debug } from '@sentry/core';
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
  // With Nitro, the Vite plugin loads the server config when the server starts, so a `node --import` preload or an
  // import in the server entry runs it a second time. The first init wins.
  const activeClient = getActiveClient<NodeClient>();
  if (activeClient) {
    debug.log('The Sentry server SDK is already initialized, skipping a second initialization.');
    return activeClient;
  }

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
  // `tunnelRoute` enables the tunnel when the server entry loads, after this preload, so the servers must be ready to
  // answer it already.
  installTunnelHooks();

  return client;
}
