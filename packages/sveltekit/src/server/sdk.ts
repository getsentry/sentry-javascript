import { configureScope } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

import { applySdkMetadata } from '../common/metadata';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, ['sveltekit', 'node']);

  initNodeSdk(options);

  configureScope(scope => {
    scope.setTag('runtime', 'node');
  });
}
