import { NodeClientOptions } from '../../src/types';
import { resolvedSyncPromise } from '@sentry/utils';
import { createTransport } from '@sentry/core';

export function getDefaultNodeClientOptions(options: Partial<NodeClientOptions> = {}): NodeClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({}, _ => resolvedSyncPromise({ statusCode: 200 })),
    stackParser: () => [],
    ...options,
  };
}
