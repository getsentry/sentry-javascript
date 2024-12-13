import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';
import { filterLowQualityTransactions } from './utils';

/**
 * Initializes the server side of the Solid Start SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'solidstart', ['solidstart', 'node']);
  filterLowQualityTransactions(opts);

  return initNodeSdk(opts);
}
