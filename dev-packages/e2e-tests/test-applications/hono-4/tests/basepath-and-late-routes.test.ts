import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test.describe('basePath with sub-app routes', () => {
  test('traces GET on a sub-app mounted via .basePath().route()', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-basepath/v1/users';
    });

    const response = await fetch(`${baseURL}/test-basepath/v1/users`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ users: [{ id: 1, name: 'Alice' }] });

    const transaction = await transactionPromise;
    expect(transaction.transaction).toBe('GET /test-basepath/v1/users');
    expect(transaction.contexts?.trace?.op).toBe('http.server');
  });

  test('traces parameterized route under .basePath().route()', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-basepath/v1/users/:userId';
    });

    const response = await fetch(`${baseURL}/test-basepath/v1/users/42`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ userId: '42' });

    const transaction = await transactionPromise;
    expect(transaction.transaction).toBe('GET /test-basepath/v1/users/:userId');
    expect(transaction.contexts?.trace?.op).toBe('http.server');
  });
});

// TODO: this test is currently skipped because we do not yet support middleware registered on new instances (e.g. here via .basePath(..).use(...)).
test.skip('.basePath() middleware instrumentation', () => {
  test('creates middleware span for .use() on .basePath() clone', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-basepath-mw/hello';
    });

    const response = await fetch(`${baseURL}/test-basepath-mw/hello`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ greeting: 'world' });

    const transaction = await transactionPromise;
    expect(transaction.transaction).toBe('GET /test-basepath-mw/hello');

    const spans = transaction.spans || [];
    const middlewareSpan = spans.find(
      (span: { description?: string; op?: string }) =>
        span.op === 'middleware.hono' && span.description === 'basepathMiddleware',
    );

    expect(middlewareSpan).toBeDefined();
    expect(middlewareSpan?.origin).toBe('auto.middleware.hono');
  });
});

test('traces .get() route registered after .basePath()/.route() chains', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /test-late-get';
  });

  const response = await fetch(`${baseURL}/test-late-get`);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body).toEqual({ registered: 'after-chains' });

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /test-late-get');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});
