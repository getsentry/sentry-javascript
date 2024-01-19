import type { NodeOptions } from '@sentry/node';
import { init as initNodeSdk, setTag } from '@sentry/node';

import { applySdkMetadata } from '../common/metadata';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): void {
  applySdkMetadata(options, ['astro', 'node']);

  initNodeSdk(options);

  setTag('runtime', 'node');
}
