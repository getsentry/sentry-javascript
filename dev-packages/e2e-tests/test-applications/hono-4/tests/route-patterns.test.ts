import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

const PREFIX = '/test-routes';

const REGISTRATION_STYLES = [
  { name: 'direct method', path: '' },
  { name: '.all()', path: '/all' },
  { name: '.on()', path: '/on' },
] as const;

test.describe('HTTP methods', () => {
  ['POST', 'PUT', 'DELETE', 'PATCH'].forEach(method => {
    test(`sends transaction for ${method}`, async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(PREFIX);
      });

      const response = await fetch(`${baseURL}${PREFIX}`, { method });
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`${method} ${PREFIX}`);
      expect(transaction.contexts?.trace?.op).toBe('http.server');
    });
  });
});

test.describe('route registration styles', () => {
  REGISTRATION_STYLES.forEach(({ name, path }) => {
    test(`${name} sends transaction`, async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(`${PREFIX}${path}`);
      });

      const response = await fetch(`${baseURL}${PREFIX}${path}`);
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`GET ${PREFIX}${path}`);
      expect(transaction.contexts?.trace?.op).toBe('http.server');
    });
  });

  [
    { name: '.all()', path: '/all' },
    { name: '.on()', path: '/on' },
  ].forEach(({ name, path }) => {
    test(`${name} responds to POST`, async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(`${PREFIX}${path}`);
      });

      const response = await fetch(`${baseURL}${PREFIX}${path}`, { method: 'POST' });
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`POST ${PREFIX}${path}`);
    });
  });
});

test('async handler sends transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(`${PREFIX}/async`);
  });

  const response = await fetch(`${baseURL}${PREFIX}/async`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe(`GET ${PREFIX}/async`);
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});
