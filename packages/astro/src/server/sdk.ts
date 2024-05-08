import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk, setTag } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  const opts = {
    ...options,
  };
  applySdkMetadata(opts, 'astro', ['astro', 'node']);

  initNodeSdk(opts);

  setTag('runtime', 'node');
}
