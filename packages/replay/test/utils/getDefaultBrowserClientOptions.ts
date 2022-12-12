import { createTransport } from '@sentry/core';
import { ClientOptions } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

export function getDefaultBrowserClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
