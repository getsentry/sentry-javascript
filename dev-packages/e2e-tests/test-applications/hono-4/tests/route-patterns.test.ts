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
  ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].forEach(method => {
    test(`sends transaction for ${method}`, async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `${method} ${PREFIX}`;
      });

      const response = await fetch(`${baseURL}${PREFIX}`, { method });
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`${method} ${PREFIX}`);
      expect(transaction.contexts?.trace?.op).toBe('http.server');
      expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');

      const spans = transaction.spans || [];
      const middlewareSpans = spans.filter(s => s.op === 'middleware.hono');
      expect(middlewareSpans).toEqual([]);
    });
  });
});

test.describe('route registration styles', () => {
  REGISTRATION_STYLES.forEach(({ name, path }) => {
    test(`${name} sends transaction with route source`, async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${PREFIX}${path}`;
      });

      const response = await fetch(`${baseURL}${PREFIX}${path}`);
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`GET ${PREFIX}${path}`);
      expect(transaction.contexts?.trace?.op).toBe('http.server');
      expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');

      const spans = transaction.spans || [];
      const middlewareSpans = spans.filter(s => s.op === 'middleware.hono');
      expect(middlewareSpans).toEqual([]);
    });
  });

  [
    { name: '.all()', path: '/all' },
    { name: '.on()', path: '/on' },
  ].forEach(({ name, path }) => {
    test(`${name} responds to POST`, async ({ baseURL }) => {
      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && event.transaction === `POST ${PREFIX}${path}`;
      });

      const response = await fetch(`${baseURL}${PREFIX}${path}`, { method: 'POST' });
      expect(response.status).toBe(200);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`POST ${PREFIX}${path}`);
      expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');

      const spans = transaction.spans || [];
      const middlewareSpans = spans.filter(s => s.op === 'middleware.hono');
      expect(middlewareSpans).toEqual([]);
    });
  });
});

test.describe('request data extraction', () => {
  test('includes method, url, and headers on transaction', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${PREFIX}`;
    });

    const response = await fetch(`${baseURL}${PREFIX}`);
    expect(response.status).toBe(200);

    const transaction = await transactionPromise;
    expect(transaction.request?.method).toBe('GET');
    expect(transaction.request?.url).toContain(PREFIX);
    expect(transaction.request?.headers).toBeDefined();
  });

  test('includes query_string when present', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${PREFIX}`;
    });

    const response = await fetch(`${baseURL}${PREFIX}?foo=bar&baz=42`);
    expect(response.status).toBe(200);

    const transaction = await transactionPromise;

    expect(transaction.request?.method).toBe('GET');
    expect(transaction.request?.url).toContain(PREFIX);
    expect(transaction.request?.query_string).toBe('foo=bar&baz=42');
  });

  test('includes request data for POST with headers', async ({ baseURL }) => {
    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && event.transaction === `POST ${PREFIX}`;
    });

    const response = await fetch(`${baseURL}${PREFIX}`, {
      method: 'POST',
      headers: { 'X-Custom-Header': 'test-value' },
    });
    expect(response.status).toBe(200);

    const transaction = await transactionPromise;
    expect(transaction.request?.method).toBe('POST');
    expect(transaction.request?.url).toContain(PREFIX);
    expect(transaction.request?.headers?.['x-custom-header']).toBe('test-value');
  });
});

test('async handler sends transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === `GET ${PREFIX}/async`;
  });

  const response = await fetch(`${baseURL}${PREFIX}/async`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.transaction).toBe(`GET ${PREFIX}/async`);
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.contexts?.trace?.data?.['sentry.source']).toBe('route');

  const spans = transaction.spans || [];
  const middlewareSpans = spans.filter(s => s.op === 'middleware.hono');
  expect(middlewareSpans).toEqual([]);
});
