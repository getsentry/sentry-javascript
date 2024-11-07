import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as nodeInit } from '@sentry/node';

/**
 * Initializes the NestJS SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  console.log(9, 'init v4');
  const opts: NodeOptions = {
    ...options,
  };

  applySdkMetadata(opts, 'nestjs');

  return nodeInit(opts);
}
