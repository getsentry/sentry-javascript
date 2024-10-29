import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should report an error event for errors thrown in getServerSideProps', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'getServerSideProps Error';
  });

  const transactionEventPromise = waitForTransaction('nextjs-13', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /[param]/error-getServerSideProps' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  await page.goto('/dogsaregreat/error-getServerSideProps');

  expect(await errorEventPromise).toMatchObject({
    contexts: {
      trace: { span_id: expect.any(String), trace_id: expect.any(String) },
    },
    event_id: expect.any(String),
    exception: {
      values: [
        {
          mechanism: { handled: false, type: 'generic' },
          type: 'Error',
          value: 'getServerSideProps Error',
          stacktrace: {
            frames: expect.arrayContaining([]),
          },
        },
      ],
    },
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/error-getServerSideProps/),
    },
    timestamp: expect.any(Number),
    transaction: 'getServerSideProps (/[param]/error-getServerSideProps)',
  });

  expect(await transactionEventPromise).toMatchObject({
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
          'http.response.status_code': 500,
          'sentry.op': 'http.server',
          'sentry.origin': 'auto',
          'sentry.source': 'route',
        },
        op: 'http.server',
        origin: 'auto',
        span_id: expect.any(String),
        status: 'internal_error',
        trace_id: expect.any(String),
      },
    },
    event_id: expect.any(String),
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/error-getServerSideProps/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /[param]/error-getServerSideProps',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});

test('Should report an error event for errors thrown in getServerSideProps in pages with custom page extensions', async ({
  page,
}) => {
  const errorEventPromise = waitForError('nextjs-13', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'custom page extension error';
  });

  const transactionEventPromise = waitForTransaction('nextjs-13', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /[param]/customPageExtension' &&
      transactionEvent.contexts?.trace?.op === 'http.server'
    );
  });

  await page.goto('/123/customPageExtension');

  expect(await errorEventPromise).toMatchObject({
    contexts: {
      trace: { span_id: expect.any(String), trace_id: expect.any(String) },
    },
    event_id: expect.any(String),
    exception: {
      values: [
        {
          mechanism: { handled: false, type: 'generic' },
          type: 'Error',
          value: 'custom page extension error',
          stacktrace: {
            frames: expect.arrayContaining([]),
          },
        },
      ],
    },
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/customPageExtension/),
    },
    timestamp: expect.any(Number),
    transaction: 'getServerSideProps (/[param]/customPageExtension)',
  });

  expect(await transactionEventPromise).toMatchObject({
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
          'http.response.status_code': 500,
          'sentry.op': 'http.server',
          'sentry.origin': 'auto',
          'sentry.source': 'route',
        },
        op: 'http.server',
        origin: 'auto',
        span_id: expect.any(String),
        status: 'internal_error',
        trace_id: expect.any(String),
      },
    },
    event_id: expect.any(String),
    platform: 'node',
    request: {
      cookies: expect.any(Object),
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringMatching(/^http.*\/customPageExtension/),
    },
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /[param]/customPageExtension',
    transaction_info: { source: 'route' },
    type: 'transaction',
  });
});
