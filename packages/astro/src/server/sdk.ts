import { applySdkMetadata } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk, setTag } from '@sentry/node';
import { GLOBAL_OBJ } from '@sentry/utils';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  const opts = {
    ...options,
  };
  applySdkMetadata(opts, 'astro', ['astro', 'node']);

  GLOBAL_OBJ._sentrySkipLoaderHookWarning = true;

  initNodeSdk(opts);

  setTag('runtime', 'node');
}
