import { applySdkMetadata, setTag } from '@sentry/core';
import type { NodeOptions } from '@sentry/node-experimental';
import { getDefaultIntegrations as getDefaultNodeIntegrations } from '@sentry/node-experimental';
import { init as initNodeSdk } from '@sentry/node-experimental';

import { rewriteFramesIntegration } from './rewriteFramesIntegration';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  const opts = {
    defaultIntegrations: [...getDefaultNodeIntegrations(options), rewriteFramesIntegration()],
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'node']);

  initNodeSdk(opts);

  setTag('runtime', 'node');
}
