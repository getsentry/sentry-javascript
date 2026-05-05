import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME } from './constants';

test.describe('route handler errors', () => {
  test('captures error with mechanism and trace correlation', async ({ baseURL }) => {
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
});

test.describe('HTTPException errors', () => {
  test('captures 5xx HTTPException', async ({ baseURL }) => {
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

  // On Node/Bun, httpServerSpansIntegration drops transactions for 3xx/4xx responses (ignoreStatusCodes), so we just use a request guard.
  // On Cloudflare the transaction is available, and we additionally verify its name.
  [301, 302].forEach(code => {
    test(`does not capture ${code} HTTPException`, async ({ baseURL }) => {
      let errorEventOccurred = false;

      waitForError(APP_NAME, event => {
        if (event.exception?.values?.[0]?.value === `HTTPException ${code}`) {
          errorEventOccurred = true;
        }
        return false;
      });

      const transactionPromise = waitForTransaction(APP_NAME, event => {
        return RUNTIME === 'cloudflare'
          ? event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/http-exception/')
          : event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /';
      });

      const response = await fetch(`${baseURL}/http-exception/${code}`, { redirect: 'manual' });
      expect(response.status).toBe(code);

      if (RUNTIME !== 'cloudflare') {
        // Simple request guard for non-Cloudflare runtimes since the other transaction is dropped for 4xx responses
        await fetch(`${baseURL}/`);
      }

      const transaction = await transactionPromise;

      if (RUNTIME === 'cloudflare') {
        expect(transaction.transaction).toBe('GET /http-exception/:code');
      }

      expect(errorEventOccurred).toBe(false);
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
        return RUNTIME === 'cloudflare'
          ? event.contexts?.trace?.op === 'http.server' && !!event.transaction?.includes('/http-exception/')
          : event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /';
      });

      const response = await fetch(`${baseURL}/http-exception/${code}`);
      expect(response.status).toBe(code);

      if (RUNTIME !== 'cloudflare') {
        // Simple request guard for non-Cloudflare runtimes since the other transaction is dropped for 4xx responses
        await fetch(`${baseURL}/`);
      }

      const transaction = await transactionPromise;

      if (RUNTIME === 'cloudflare') {
        expect(transaction.transaction).toBe('GET /http-exception/:code');
      }

      expect(errorEventOccurred).toBe(false);
    });
  });
});

test.describe('middleware errors', () => {
  test('captures 5xx HTTPException thrown in middleware with error span status', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Service Unavailable from middleware';
    });

    const transactionPromise = waitForTransaction(APP_NAME, event => {
      return (
        event.contexts?.trace?.op === 'http.server' &&
        !!event.transaction?.includes('/test-errors/middleware-http-exception')
      );
    });

    const response = await fetch(`${baseURL}/test-errors/middleware-http-exception`);
    expect(response.status).toBe(503);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('Service Unavailable from middleware');
    expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe('auto.middleware.hono');
    expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);

    const transaction = await transactionPromise;
    const middlewareSpan = (transaction.spans || []).find(s => s.op === 'middleware.hono');
    expect(middlewareSpan?.status).toBe('internal_error');
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
      if (RUNTIME === 'cloudflare') {
        return (
          event.contexts?.trace?.op === 'http.server' &&
          !!event.transaction?.includes('/test-errors/middleware-http-exception-4xx')
        );
      }
      return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /';
    });

    const response = await fetch(`${baseURL}/test-errors/middleware-http-exception-4xx`);
    expect(response.status).toBe(401);

    if (RUNTIME !== 'cloudflare') {
      await fetch(`${baseURL}/`);
    }

    const transaction = await transactionPromise;

    if (RUNTIME === 'cloudflare') {
      expect(transaction.transaction).toBe('GET /test-errors/middleware-http-exception-4xx/*');

      const middlewareSpan = (transaction.spans || []).find(s => s.op === 'middleware.hono');
      expect(middlewareSpan?.status).not.toBe('internal_error');
    }

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
