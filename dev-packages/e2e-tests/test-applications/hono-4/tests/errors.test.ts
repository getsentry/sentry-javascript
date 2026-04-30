import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test.describe('route handler errors', () => {
  test('captures error with full event shape and trace correlation', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'This is a test error for Sentry!';
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/error/');
    });

    const response = await fetch(`${baseURL}/error/test-cause`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    const transactionEvent = await transactionPromise;

    expect(transactionEvent.transaction).toBe('GET /error/:cause');

    expect(errorEvent.exception?.values).toHaveLength(1);

    const exception = errorEvent.exception?.values?.[0];
    expect(exception?.value).toBe('This is a test error for Sentry!');
    expect(exception?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });

    expect(errorEvent.transaction).toBe('GET /error/:cause');
    expect(errorEvent.request?.method).toBe('GET');
    expect(errorEvent.request?.url).toContain('/error/test-cause');

    expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
  });

  test('captures async route handler error', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Async route error';
    });

    const response = await fetch(`${baseURL}/error/async`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('Async route error');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });

  test('captures non-Error thrown value', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Non-Error thrown value';
    });

    const response = await fetch(`${baseURL}/error/non-error-throw`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('Non-Error thrown value');
  });

  test('captures error with nested cause chain', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.some(v => v.value === 'Request handler failed') ?? false;
    });

    const response = await fetch(`${baseURL}/error/nested-cause`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    const values = errorEvent.exception?.values ?? [];
    expect(values.length).toBeGreaterThanOrEqual(1);

    const topError = values.find(v => v.value === 'Request handler failed');
    expect(topError).toBeDefined();
  });

  test('captures error thrown after partial response setup', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Error after partial response setup';
    });

    const response = await fetch(`${baseURL}/test-errors/partial-response-error`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('Error after partial response setup');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });
});

test.describe('HTTPException errors', () => {
  test('captures HTTPException with 500 status', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'HTTPException 500';
    });

    const response = await fetch(`${baseURL}/http-exception/500`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('HTTPException 500');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });

  test('captures HTTPException with 502 status', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'HTTPException 502';
    });

    const response = await fetch(`${baseURL}/http-exception/502`);
    expect(response.status).toBe(502);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('HTTPException 502');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });

  [401, 403, 404].forEach(code => {
    test(`does not capture ${code} HTTPException`, async ({ baseURL }) => {
      let errorEventOccurred = false;

      waitForError(APP_NAME, event => {
        if (event.exception?.values?.[0]?.value === `HTTPException ${code}`) {
          errorEventOccurred = true;
        }
        return false;
      });

      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/http-exception/');
      });

      const response = await fetch(`${baseURL}/http-exception/${code}`);
      expect(response.status).toBe(code);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe('GET /http-exception/:code');
      expect(errorEventOccurred).toBe(false);
    });
  });
});

test.describe('middleware errors', () => {
  test('captures 5xx HTTPException thrown in middleware', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Service Unavailable from middleware';
    });

    const response = await fetch(`${baseURL}/test-errors/middleware-http-exception`);
    expect(response.status).toBe(503);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('Service Unavailable from middleware');
    expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe('auto.middleware.hono');
    expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);
  });

  test('does not capture 4xx HTTPException thrown in middleware', async ({ baseURL }) => {
    let errorEventOccurred = false;

    waitForError(APP_NAME, event => {
      if (event.exception?.values?.[0]?.value === 'Unauthorized from middleware') {
        errorEventOccurred = true;
      }
      return false;
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return (
        event.contexts?.trace?.op === 'http.server' &&
        !!event.transaction?.includes('/test-errors/middleware-http-exception-4xx')
      );
    });

    const response = await fetch(`${baseURL}/test-errors/middleware-http-exception-4xx`);
    expect(response.status).toBe(401);

    const transaction = await transactionPromise;
    expect(transaction.transaction).toBe('GET /test-errors/middleware-http-exception-4xx/*');
    expect(errorEventOccurred).toBe(false);
  });
});

test.describe('nested sub-app errors', () => {
  test('captures error from nested child sub-app', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Nested child app error';
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/nested/child/error');
    });

    const response = await fetch(`${baseURL}/test-errors/nested/child/error`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    const transaction = await transactionPromise;

    expect(transaction.transaction).toBe('GET /test-errors/nested/child/error');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Nested child app error');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
    expect(errorEvent.request?.url).toContain('/test-errors/nested/child/error');
  });

  test('captures error from deeply nested sub-app route', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Deeply nested child app error';
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/nested/child/deep/error');
    });

    const response = await fetch(`${baseURL}/test-errors/nested/child/deep/error`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    const transaction = await transactionPromise;

    expect(transaction.transaction).toBe('GET /test-errors/nested/child/deep/error');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Deeply nested child app error');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });
});

test.describe('custom onError handler', () => {
  test('captures error even when onError handles the response', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Error caught by custom onError';
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/custom-on-error/fail');
    });

    const response = await fetch(`${baseURL}/test-errors/custom-on-error/fail`);
    expect(response.status).toBe(500);

    const body = await response.text();
    expect(body).toContain('Handled by onError');

    const errorEvent = await errorPromise;
    const transaction = await transactionPromise;

    expect(transaction.transaction).toBe('GET /test-errors/custom-on-error/fail');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Error caught by custom onError');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });
});

test.describe('no error capture for non-error responses', () => {
  [
    { description: '301 redirect', path: '/redirect/301', expectedStatus: 301 },
    { description: '302 redirect', path: '/redirect/302', expectedStatus: 302 },
  ].forEach(({ description, path, expectedStatus }) => {
    test(`does not capture error for ${description}`, async ({ baseURL }) => {
      let errorEventOccurred = false;

      waitForError(APP_NAME, event => {
        if (event.request?.url?.includes(path)) {
          errorEventOccurred = true;
        }
        return false;
      });

      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(path);
      });

      const response = await fetch(`${baseURL}${path}`, { redirect: 'manual' });
      expect(response.status).toBe(expectedStatus);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`GET ${path}`);
      expect(errorEventOccurred).toBe(false);
    });
  });

  [
    { description: '400 status without throw', path: '/status/400', expectedStatus: 400 },
    { description: '403 status without throw', path: '/status/403', expectedStatus: 403 },
    { description: '404 status without throw', path: '/status/404', expectedStatus: 404 },
  ].forEach(({ description, path, expectedStatus }) => {
    test(`does not capture error for ${description}`, async ({ baseURL }) => {
      let errorEventOccurred = false;

      waitForError(APP_NAME, event => {
        if (event.request?.url?.includes(path)) {
          errorEventOccurred = true;
        }
        return false;
      });

      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes(path);
      });

      const response = await fetch(`${baseURL}${path}`);
      expect(response.status).toBe(expectedStatus);

      const transaction = await transactionPromise;
      expect(transaction.transaction).toBe(`GET ${path}`);
      expect(errorEventOccurred).toBe(false);
    });
  });

  test('does not capture error for non-existent route (404)', async ({ baseURL }) => {
    let errorEventOccurred = false;

    waitForError(APP_NAME, event => {
      if (event.request?.url?.includes('/this-route-does-not-exist')) {
        errorEventOccurred = true;
      }
      return false;
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/this-route-does-not-exist');
    });

    const response = await fetch(`${baseURL}/this-route-does-not-exist`);
    expect(response.status).toBe(404);

    const transaction = await transactionPromise;
    expect(transaction.transaction).toBe('GET /this-route-does-not-exist');
    expect(errorEventOccurred).toBe(false);
  });

  test('does not capture error for successful 200 response', async ({ baseURL }) => {
    let errorEventOccurred = false;

    waitForError(APP_NAME, event => {
      if (event.request?.url?.includes('/?sentry-test-no-error')) {
        errorEventOccurred = true;
      }
      return false;
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('GET /');
    });

    const response = await fetch(`${baseURL}/?sentry-test-no-error`);
    expect(response.status).toBe(200);

    const transaction = await transactionPromise;
    expect(transaction.transaction).toBe('GET /');
    expect(errorEventOccurred).toBe(false);
  });
});
