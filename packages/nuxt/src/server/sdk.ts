import { applySdkMetadata, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const sentryOptions = {
    defaultIntegrations: [...getDefaultNodeIntegrations(options)],
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  const client = initNodeSdk(sentryOptions);

  setTag('runtime', 'node');

  return client;
}
