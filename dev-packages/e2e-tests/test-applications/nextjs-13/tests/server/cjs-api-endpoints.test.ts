import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const packageJson = require('../../package.json');
const nextjsVersion = packageJson.dependencies.next;
const nextjsMajor = Number(nextjsVersion.split('.')[0]);

test('should create a transaction for a CJS pages router API endpoint', async ({ request }) => {
  test.skip(nextjsMajor > 13, 'Next.js does not like CJS routes after a certain point.');

  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/cjs-api-endpoint' &&
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction_info?.source === 'route'
    );
  });

  const result = (await request.get(`/api/cjs-api-endpoint`)).json();

  expect(await result).toMatchObject({ success: true });

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      otel: {
        resource: {
          'service.name': 'node',
          'service.namespace': 'sentry',
          'service.version': expect.any(String),
          'telemetry.sdk.language': 'nodejs',
          'telemetry.sdk.name': 'opentelemetry',
          'telemetry.sdk.version': expect.any(String),
        },
      },
      runtime: { name: 'node', version: expect.any(String) },
      trace: {
        data: {
          'http.response.status_code': 200,
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.nextjs',
          'sentry.sample_rate': 1,
          'sentry.source': 'route',
        },
        op: 'http.server',
        origin: 'auto.http.nextjs',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        status: 'ok',
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    event_id: expect.any(String),
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/api\/cjs-api-endpoint$/),
    },
    spans: expect.arrayContaining([]),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /api/cjs-api-endpoint',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('should not mess up require statements in CJS API endpoints', async ({ request }) => {
  test.skip(nextjsMajor > 13, 'Next.js does not like CJS routes after a certain point.');

  const transactionPromise = waitForTransaction('nextjs-13', async transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/cjs-api-endpoint-with-require' &&
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction_info?.source === 'route'
    );
  });

  const result = (await request.get(`/api/cjs-api-endpoint-with-require`)).json();

  expect(await result).toMatchObject({ success: true });

  const transaction = await transactionPromise;

  expect(transaction).toMatchObject({
    contexts: {
      otel: {
        resource: {
          'service.name': 'node',
          'service.namespace': 'sentry',
          'service.version': expect.any(String),
          'telemetry.sdk.language': 'nodejs',
          'telemetry.sdk.name': 'opentelemetry',
          'telemetry.sdk.version': expect.any(String),
        },
      },
      runtime: { name: 'node', version: expect.any(String) },
      trace: {
        data: {
          'http.response.status_code': 200,
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.nextjs',
          'sentry.sample_rate': 1,
          'sentry.source': 'route',
        },
        op: 'http.server',
        origin: 'auto.http.nextjs',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        status: 'ok',
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    environment: 'qa',
    event_id: expect.any(String),
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/api\/cjs-api-endpoint-with-require$/),
    },
    spans: expect.arrayContaining([]),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /api/cjs-api-endpoint-with-require',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});
