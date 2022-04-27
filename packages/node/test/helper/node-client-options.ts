import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/utils';

import { NodeClientOptions } from '../../src/types';

export function getDefaultNodeClientOptions(options: Partial<NodeClientOptions> = {}): NodeClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({}, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
