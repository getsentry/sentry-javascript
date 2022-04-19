import { NoopTransport } from '@sentry/core';
import { BrowserClientOptions } from '../../../src/client';

export function getDefaultBrowserClientOptions(options: Partial<BrowserClientOptions> = {}): BrowserClientOptions {
  return {
    integrations: [],
    transport: NoopTransport,
    stackParser: () => [],
    ...options,
  };
}
