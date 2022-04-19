import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/utils';

import { BrowserClientOptions } from '../../../src/client';

export function getDefaultBrowserClientOptions(options: Partial<BrowserClientOptions> = {}): BrowserClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({}, _ => resolvedSyncPromise({ statusCode: 200 })),
    stackParser: () => [],
    ...options,
  };
}
