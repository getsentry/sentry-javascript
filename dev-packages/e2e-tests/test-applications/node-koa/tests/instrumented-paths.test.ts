import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('instruments RegExp router routes', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-koa', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && !!transactionEvent.transaction?.includes('test-regexp')
    );
  });

  await fetch(`${baseURL}/test-regexp`);

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'router.koa',
        origin: 'auto.http.otel.koa',
        data: expect.objectContaining({
          'koa.type': 'router',
          'sentry.op': 'router.koa',
          'sentry.origin': 'auto.http.otel.koa',
          'http.route': '/^\\/test-regexp/',
        }),
      }),
    ]),
  );
});

test('instruments nested routers with the composed http.route', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-koa', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /:first/details/:id'
    );
  });

  await fetch(`${baseURL}/shop/details/1`);

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'router.koa',
        description: '/:first/details/:id',
        data: expect.objectContaining({
          'koa.type': 'router',
          'http.route': '/:first/details/:id',
          'sentry.op': 'router.koa',
          'sentry.origin': 'auto.http.otel.koa',
        }),
      }),
    ]),
  );
});

test('does not instrument the same middleware twice', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-koa', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /test-dedup'
    );
  });

  await fetch(`${baseURL}/test-dedup`);

  const transactionEvent = await transactionPromise;

  // The route stack is [sharedRouteMiddleware, sharedRouteMiddleware, handler]; the repeated
  // middleware instance is skipped, leaving one span for it plus the handler span.
  const dedupSpans = transactionEvent.spans?.filter(
    span => span.op === 'router.koa' && span.description === '/test-dedup',
  );
  expect(dedupSpans).toHaveLength(2);
});

test('marks the layer span as errored when a handler throws', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('node-koa', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /test-exception/:id'
    );
  });

  await fetch(`${baseURL}/test-exception/123`);

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'router.koa',
        origin: 'auto.http.otel.koa',
        status: 'internal_error',
      }),
    ]),
  );
});
