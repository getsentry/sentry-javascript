import { applySdkMetadata, getCurrentScope } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';
import { addOrUpdateIntegration } from '@sentry/utils';

import { rewriteFramesIteratee } from './utils';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, 'sveltekit', ['sveltekit', 'node']);

  addServerIntegrations(options);

  initNodeSdk(options);

  getCurrentScope().setTag('runtime', 'node');
}

function addServerIntegrations(options: NodeOptions): void {
  options.integrations = addOrUpdateIntegration(
    // eslint-disable-next-line deprecation/deprecation
    new RewriteFrames({ iteratee: rewriteFramesIteratee }),
    options.integrations || [],
  );
}
