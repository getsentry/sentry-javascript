import { createTransport, resolvedSyncPromise } from '@sentry/core';
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
