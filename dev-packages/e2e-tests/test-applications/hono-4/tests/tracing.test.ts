import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test('sends a transaction for the index route', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /';
  });

  const response = await fetch(`${baseURL}/`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});

test('sends a transaction for a parameterized route', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/test-param/');
  });

  const response = await fetch(`${baseURL}/test-param/123`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /test-param/:paramId');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});

test('sends a transaction for a route that throws', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/error/');
  });

  await fetch(`${baseURL}/error/test-cause`);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe('GET /error/:cause');
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.contexts?.trace?.status).toBe('internal_error');
});
