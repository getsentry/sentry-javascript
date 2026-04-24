import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test('sends a transaction for the index route', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction(APP_NAME, event => {
    return event.transaction === 'GET /';
  });

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});

test('sends a transaction for a parameterized route', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction(APP_NAME, event => {
    return event.transaction === 'GET /test-param/:paramId';
  });

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.transaction).toBe('GET /test-param/:paramId');
});

test('sends a transaction for a route that throws', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction(APP_NAME, event => {
    return event.transaction === 'GET /error/:cause';
  });

  await fetch(`${baseURL}/error/test-cause`);

  const transaction = await transactionWaiter;
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.contexts?.trace?.status).toBe('internal_error');
});
