import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/utils';

import type { NodeClientOptions } from '../../src/types';

export function getDefaultNodeClientOptions(options: Partial<NodeClientOptions> = {}): NodeClientOptions {
  return {
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
