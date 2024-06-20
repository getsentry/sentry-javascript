import { applySdkMetadata, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

import { rewriteFramesIntegration } from './rewriteFramesIntegration';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): NodeClient {
  const opts = {
    defaultIntegrations: [...getDefaultNodeIntegrations(options), rewriteFramesIntegration()],
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  return client;
}
