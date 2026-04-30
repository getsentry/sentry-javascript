import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
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

test.describe('500 HTTPException capture', () => {
  REGISTRATION_STYLES.forEach(({ name, path }) => {
    test(`captures 500 from ${name} route with correct mechanism`, async ({ baseURL }) => {
      const fullPath = `${PREFIX}${path}/500`;

      const errorPromise = waitForError(APP_NAME, event => {
        return event.exception?.values?.[0]?.value === 'response 500' && !!event.request?.url?.includes(fullPath);
      });

      const response = await fetch(`${baseURL}${fullPath}`);
      expect(response.status).toBe(500);

      const errorEvent = await errorPromise;
      expect(errorEvent.exception?.values?.[0]?.value).toBe('response 500');
      expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
        expect.objectContaining({
          handled: false,
          type: 'auto.http.hono.context_error',
        }),
      );
    });
  });

  test('captures 500 error with POST method', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return (
        event.exception?.values?.[0]?.value === 'response 500' &&
        !!event.request?.url?.includes(`${PREFIX}/500`) &&
        event.request?.method === 'POST'
      );
    });

    const response = await fetch(`${baseURL}${PREFIX}/500`, { method: 'POST' });
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('response 500');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
      expect.objectContaining({
        handled: false,
        type: 'auto.http.hono.context_error',
      }),
    );
  });
});

test.describe('4xx HTTPException filtering', () => {
  [401, 402, 403].forEach(code => {
    test(`does not capture ${code} HTTPException`, async ({ baseURL }) => {
      const fullPath = `${PREFIX}/${code}`;
      let errorEventOccurred = false;

      waitForError(APP_NAME, event => {
        if (event.exception?.values?.[0]?.value === `response ${code}` && event.request?.url?.includes(fullPath)) {
          errorEventOccurred = true;
        }
        return false;
      });

      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(`${PREFIX}/${code}`);
      });

      const response = await fetch(`${baseURL}${fullPath}`);
      expect(response.status).toBe(code);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`GET ${PREFIX}/${code}`);
      expect(errorEventOccurred).toBe(false);
    });
  });
});
