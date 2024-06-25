import { applySdkMetadata, setTag } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'solidstart', ['solidstart', 'node']);

  const client = initNodeSdk(opts);

  setTag('runtime', 'node');

  return client;
}
