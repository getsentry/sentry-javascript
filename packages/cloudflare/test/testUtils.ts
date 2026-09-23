import { context, propagation, trace } from '@opentelemetry/api';
import { getMainCarrier, setCurrentClient } from '@sentry/core';
import { vi } from 'vitest';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';
import { _clearGlobalClientCache } from '../src/clientCache';

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
}

function cleanupOtel(): void {
  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();
}

export function resetSdk(): void {
  resetGlobals();
  cleanupOtel();
  _clearGlobalClientCache();
}

/**
 * Resets the SDK and sets a `CloudflareClient` with a DSN, a mock transport and `tracesSampleRate: 1`
 * as the current client. `overrides` replace these default options.
 */
export function initTestClient(overrides: Partial<CloudflareClientOptions> = {}): CloudflareClient {
  resetSdk();

  const client = new CloudflareClient({
    dsn: 'https://123@sentry.io/42',
    tracesSampleRate: 1,
    stackParser: () => [],
    integrations: [],
    transport: () => ({
      send: vi.fn().mockResolvedValue({}),
      flush: vi.fn().mockResolvedValue(true),
    }),
    ...overrides,
  });
  setCurrentClient(client);
  client.init();

  return client;
}
