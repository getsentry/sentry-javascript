import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as nodeInit } from '@sentry/node';

/**
 * Initializes the Nitro SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  const opts: NodeOptions = {
    ..._INTERNAL_captureOptionsSetByUser(options),
  };

  applySdkMetadata(opts, 'nitro', ['nitro', 'node']);

  const client = nodeInit(opts);

  return client;
}
