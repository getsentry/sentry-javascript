import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as initNodeSdk } from '@sentry/node';

/**
 * Initializes the server side of the TanStack Start React SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const sentryOptions: NodeOptions = {
    defaultIntegrations: [...getDefaultNodeIntegrations(options)],
    ...options,
  };

  applySdkMetadata(sentryOptions, 'tanstackstart-react', ['tanstackstart-react', 'node']);

  return initNodeSdk(sentryOptions);
}
