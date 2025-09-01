import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as initNodeSdk } from '@sentry/node';
import { rewriteFramesIntegration } from '../server-common/integrations/rewriteFramesIntegration';
import { svelteKitSpansIntegration } from '../server-common/integrations/svelteKitSpans';
import { httpIntegration } from './integrations/http';

/**
 * Initialize the Server-side Sentry SDK
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const defaultIntegrations = [
    ...getDefaultNodeIntegrations(options).filter(integration => integration.name !== 'Http'),
    rewriteFramesIntegration(),
    httpIntegration(),
    svelteKitSpansIntegration(),
  ];

  const opts = {
    defaultIntegrations,
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'node']);

  const client = initNodeSdk(opts);

  if (typeof process !== 'undefined') {
    process.on('sveltekit:shutdown', async () => {
      if (client) {
        await client.close(2000);
      }
    });
  }

  return client;
}
