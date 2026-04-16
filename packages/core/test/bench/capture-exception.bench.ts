import { bench, describe } from 'vitest';
import {
  addBreadcrumb,
  captureException,
  getCurrentScope,
  getIsolationScope,
  setCurrentClient,
} from '../../src';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { clearGlobalScope } from '../testutils';

function setupClient() {
  clearGlobalScope();
  getCurrentScope().clear();
  getIsolationScope().clear();

  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      enableSend: true,
      release: '1.0.0',
      environment: 'production',
    }),
  );
  setCurrentClient(client);
  client.init();
  return client;
}

describe('captureException - minimal scope', () => {
  setupClient();

  bench('captureException(new Error(...))', () => {
    captureException(new Error('Something went wrong'));
  });
});

describe('captureException - realistic scope', () => {
  setupClient();

  getCurrentScope().setUser({ id: '123', email: 'user@example.com' });
  getCurrentScope().setTag('service', 'api-gateway');
  getCurrentScope().setTag('region', 'us-east-1');
  getCurrentScope().setTag('version', '2.1.0');
  getCurrentScope().setExtra('request_id', 'req-abc-123');
  for (let i = 0; i < 10; i++) {
    addBreadcrumb({ message: `Action ${i}`, category: 'http', level: 'info' });
  }

  bench('captureException(new Error(...))', () => {
    captureException(new Error('Something went wrong'));
  });
});
