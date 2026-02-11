import { createTransport, resolvedSyncPromise } from '@sentry/core';
import type { BrowserClientOptions } from '../../src/client';

export function getDefaultBrowserClientOptions(options: Partial<BrowserClientOptions> = {}): BrowserClientOptions {
  return {
    dsn: 'http://examplePublicKey@localhost/0',
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
