import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as nodeInit } from '@sentry/node';

/**
 * Initializes the NestJS SDK
 */
export function init(options: NodeOptions): void {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'nestjs');

  nodeInit(opts);
}
