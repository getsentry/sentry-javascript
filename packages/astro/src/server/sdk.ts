import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk, setTag } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, 'astro', ['astro', 'node']);

  initNodeSdk(options);

  setTag('runtime', 'node');
}
