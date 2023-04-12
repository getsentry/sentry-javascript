import { configureScope } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk, Integrations } from '@sentry/node';
import { addOrUpdateIntegration } from '@sentry/utils';

import { applySdkMetadata } from '../common/metadata';

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
  options.integrations = addOrUpdateIntegration(new Integrations.Undici(), options.integrations || []);
  options.integrations = addOrUpdateIntegration(new RewriteFrames(), options.integrations || []);
}
