import { getCurrentScope } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

import { applySdkMetadata } from '../common/metadata';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, ['astro', 'node']);

  initNodeSdk(options);

  getCurrentScope().setTag('runtime', 'node');
}
