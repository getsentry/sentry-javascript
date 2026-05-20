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
