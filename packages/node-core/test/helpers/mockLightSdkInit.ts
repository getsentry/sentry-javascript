import { createTransport, getCurrentScope, getGlobalScope, getIsolationScope, resolvedSyncPromise } from '@sentry/core';
import { init } from '../../src/light/sdk';
import type { NodeClientOptions } from '../../src/types';

const PUBLIC_DSN = 'https://username@domain/123';

export function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

export function mockLightSdkInit(options?: Partial<NodeClientOptions>) {
  resetGlobals();
  const client = init({
    dsn: PUBLIC_DSN,
    defaultIntegrations: false,
    // We are disabling client reports because we would be acquiring resources with every init call and that would leak
    // memory every time we call init in the tests
    sendClientReports: false,
    // Use a mock transport to prevent network calls
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    ...options,
  });

  return client;
}

export function cleanupLightSdk(): void {
  resetGlobals();
}
