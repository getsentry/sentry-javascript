import { createTransport, resolvedSyncPromise } from '@sentry/core';
import type { BunClientOptions } from '../src/types';

export function getDefaultBunClientOptions(options: Partial<BunClientOptions> = {}): BunClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
