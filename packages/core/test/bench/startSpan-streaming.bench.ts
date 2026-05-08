import { bench, describe } from 'vitest';
import {
  addBreadcrumb,
  getCurrentScope,
  getIsolationScope,
  setCurrentClient,
  spanStreamingIntegration,
  startSpan,
} from '../../src';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { clearGlobalScope } from '../testutils';

function setupStreamingClient() {
  clearGlobalScope();
  getCurrentScope().clear();
  getIsolationScope().clear();

  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      enableSend: true,
      tracesSampleRate: 1,
      traceLifecycle: 'stream',
      release: '1.0.0',
      environment: 'production',
      integrations: [spanStreamingIntegration()],
    }),
  );
  setCurrentClient(client);
  client.init();
  return client;
}

function addRealisticScopeData() {
  getCurrentScope().setUser({ id: '123', email: 'user@example.com' });
  getCurrentScope().setTag('service', 'api-gateway');
  getCurrentScope().setTag('region', 'us-east-1');
  getCurrentScope().setTag('version', '2.1.0');
  getCurrentScope().setExtra('request_id', 'req-abc-123');
  for (let i = 0; i < 10; i++) {
    addBreadcrumb({ message: `Action ${i}`, category: 'http', level: 'info' });
  }
}

describe('startSpan streaming pipeline - realistic scope', () => {
  setupStreamingClient();
  addRealisticScopeData();

  bench('single root span', () => {
    startSpan({ name: 'GET /api/users', op: 'http.server' }, () => {
      // span lifecycle only
    });
  });

  bench('root span + 5 child spans', () => {
    startSpan({ name: 'GET /api/users', op: 'http.server' }, () => {
      for (let i = 0; i < 5; i++) {
        startSpan({ name: `SELECT * FROM users WHERE id = $${i + 1}`, op: 'db' }, span => {
          span.setAttribute('db.system', 'postgresql');
          span.setAttribute('db.name', 'mydb');
        });
      }
    });
  });

  bench('root span + 10 child spans', () => {
    startSpan({ name: 'GET /api/users', op: 'http.server' }, () => {
      for (let i = 0; i < 10; i++) {
        startSpan(
          { name: i < 5 ? `db.query.${i}` : `http.request.${i}`, op: i < 5 ? 'db' : 'http.client' },
          span => {
            span.setAttribute('key', 'value');
          },
        );
      }
    });
  });

  bench('root span + 100 child spans', () => {
    startSpan({ name: 'GET /api/users', op: 'http.server' }, () => {
      for (let i = 0; i < 100; i++) {
        startSpan({ name: `operation.${i}`, op: 'db' }, span => {
          span.setAttribute('db.system', 'postgresql');
        });
      }
    });
  });

  bench('root span + 1000 child spans', () => {
    startSpan({ name: 'GET /api/users', op: 'http.server' }, () => {
      for (let i = 0; i < 1000; i++) {
        startSpan({ name: `operation.${i}`, op: 'db' }, span => {
          span.setAttribute('db.system', 'postgresql');
        });
      }
    });
  });
});
