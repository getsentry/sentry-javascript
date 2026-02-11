import type { ClientOptions } from '@sentry/core';
import { createTransport, resolvedSyncPromise } from '@sentry/core';

export function getDefaultNodeClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    dsn: 'http://examplePublicKey@localhost/0',
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
