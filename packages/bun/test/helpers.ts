import { createTransport } from '@sentry/core';

import type { BunClientOptions } from '../src/types';

export function getDefaultBunClientOptions(options: Partial<BunClientOptions> = {}): BunClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    ...options,
  };
}
