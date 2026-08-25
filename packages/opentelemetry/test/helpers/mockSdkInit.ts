import type { ClientOptions, Options } from '@sentry/core';
import { getMainCarrier } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '../../src/asyncContextStrategy';
import { initOtel } from './initOtel';
import type { TestClient } from './TestClient';
import { init as initTestClient } from './TestClient';

const PUBLIC_DSN = 'https://username@domain/123';

/**
 * Initialize Sentry for Node.
 */
function init(options: Partial<Options> | undefined = {}): TestClient {
  setOpenTelemetryContextAsyncContextStrategy();
  const client = initTestClient(options);
  initOtel();
  return client;
}

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
}

export function mockSdkInit(options?: Partial<ClientOptions>): TestClient {
  resetGlobals();

  return init({ dsn: PUBLIC_DSN, ...options })!;
}
