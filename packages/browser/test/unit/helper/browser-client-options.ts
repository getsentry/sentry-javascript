import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/utils';

import type { BrowserClientOptions } from '../../../src/client';

export function getDefaultBrowserClientOptions(options: Partial<BrowserClientOptions> = {}): BrowserClientOptions {
  return {
    dsn: 'http://examplePublicKey@localhost/0',
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
