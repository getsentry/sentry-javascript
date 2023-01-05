import { createTransport } from '@sentry/core';
import { ClientOptions } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

export function getDefaultBrowserClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    dsn: 'https://username@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
