import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should report an error event for errors thrown in pages router api routes', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-13', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'api route error';
  });

  const transactionEventPromise = waitForTransaction('nextjs-13', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/[param]/failure-api-route' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  request.get('/api/foo/failure-api-route').catch(e => {
    // expected to crash
  });

  expect(await errorEventPromise).toMatchObject({
    contexts: {
      runtime: { name: 'node', version: expect.any(String) },
      trace: { span_id: expect.stringMatching(/[a-f0-9]{16}/), trace_id: expect.stringMatching(/[a-f0-9]{32}/) },
    },
    exception: {
      values: [
        {
          mechanism: {
            data: {
              function: 'withSentry',
            },
            handled: false,
            type: 'auto.http.nextjs.api_handler',
          },
          stacktrace: { frames: expect.arrayContaining([]) },
          type: 'Error',
          value: 'api route error',
        },
      ],
    },
    platform: 'node',
    request: {
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/api\/foo\/failure-api-route$/),
    },
    timestamp: expect.any(Number),
    transaction: 'GET /api/[param]/failure-api-route',
  });

  expect(await transactionEventPromise).toMatchObject({
    contexts: {
      runtime: { name: 'node', version: expect.any(String) },
      trace: {
        data: {
          'http.response.status_code': 500,
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.nextjs',
          'sentry.source': 'route',
        },
        op: 'http.server',
        origin: 'auto.http.nextjs',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        status: 'internal_error',
        trace_id: (await errorEventPromise).contexts?.trace?.trace_id,
      },
    },
    platform: 'node',
    request: {
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/api\/foo\/failure-api-route$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /api/[param]/failure-api-route',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('Should report a transaction event for a successful pages router api route', async ({ request }) => {
  const transactionEventPromise = waitForTransaction('nextjs-13', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /api/[param]/success-api-route' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  request.get('/api/foo/success-api-route').catch(e => {
    // we don't care about crashes
  });

  expect(await transactionEventPromise).toMatchObject({
    contexts: {
      runtime: { name: 'node', version: expect.any(String) },
      trace: {
        data: {
          'http.response.status_code': 200,
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.nextjs',
          'sentry.source': 'route',
        },
        op: 'http.server',
        origin: 'auto.http.nextjs',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        status: 'ok',
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    },
    platform: 'node',
    request: {
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/api\/foo\/success-api-route$/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /api/[param]/success-api-route',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});
