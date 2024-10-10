import { createTransport } from '@sentry/core';
import type { ClientOptions } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

export function getDefaultNodeClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    dsn: 'http://examplePublicKey@localhost/0',
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
