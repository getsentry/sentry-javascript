import { configureScope } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk, Integrations } from '@sentry/node';
import { addOrUpdateIntegration } from '@sentry/utils';

import { applySdkMetadata } from '../common/metadata';
import { rewriteFramesIteratee } from './utils';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, ['sveltekit', 'node']);

  addServerIntegrations(options);

  initNodeSdk(options);

  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}

function addServerIntegrations(options: NodeOptions): void {
  options.integrations = addOrUpdateIntegration(
    new RewriteFrames({ iteratee: rewriteFramesIteratee }),
    options.integrations || [],
  );
}
