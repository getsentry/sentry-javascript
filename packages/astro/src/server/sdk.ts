import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node-experimental';
import { init as initNodeSdk, setTag } from '@sentry/node-experimental';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, 'astro', ['astro', 'node']);

  initNodeSdk(options);

  setTag('runtime', 'node');
}
