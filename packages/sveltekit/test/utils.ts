import { createTransport } from '@sentry/core';
import type { ClientOptions } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

export function getDefaultNodeClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
