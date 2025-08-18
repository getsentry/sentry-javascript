import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as initNodeSdk } from '@sentry/node';
import { svelteKitSpansIntegration } from '../server-common/processKitSpans';
import { rewriteFramesIntegration } from '../server-common/rewriteFramesIntegration';

/**
 * Initialize the Server-side Sentry SDK
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    defaultIntegrations: [
      ...getDefaultNodeIntegrations(options),
      rewriteFramesIntegration(),
      svelteKitSpansIntegration(),
    ],
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'node']);

  return initNodeSdk(opts);
}
