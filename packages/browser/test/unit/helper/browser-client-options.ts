import { NoopTransport } from '@sentry/core';
<<<<<<< HEAD

=======
>>>>>>> bb8f9175e (fix remaning browser unit tests)
import { BrowserClientOptions } from '../../../src/client';

export function getDefaultBrowserClientOptions(options: Partial<BrowserClientOptions> = {}): BrowserClientOptions {
  return {
    integrations: [],
    transport: NoopTransport,
    stackParser: () => [],
    ...options,
  };
}
