import { expect, test } from '@playwright/test';
import {
  waitForError,
  waitForStreamedSpan,
  getSpanOp,
  collectStreamedSpansUntilSegment,
} from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME } from './constants';

test.describe('route handler errors', () => {
  test('captures error with mechanism and trace correlation', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'This is a test error for Sentry!';
    });

    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment => segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/error/'),
    );

    const response = await fetch(`${baseURL}/error/test-cause`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    const segmentEvent = await segmentPromise;

    expect(segmentEvent.name).toBe('GET /error/:cause');

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
    expect(errorEvent.request?.headers).toBeDefined();

    expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentEvent?.trace_id);
  });

  test('captures three linked errors', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.some(exception => exception.value === 'Failure 3');
    });

    const response = await fetch(`${baseURL}/linked-error`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values).toHaveLength(3);

    const firstCause = errorEvent.exception?.values?.[0];
    expect(firstCause?.value).toBe('Failure 1');
    expect(firstCause?.mechanism).toEqual({
      exception_id: 2,
      handled: true,
      parent_id: 1,
      source: 'cause',
      type: 'chained',
    });

    const secondCause = errorEvent.exception?.values?.[1];
    expect(secondCause?.value).toBe('Failure 2');
    expect(secondCause?.mechanism).toEqual({
      exception_id: 1,
      handled: true,
      parent_id: 0,
      source: 'cause',
      type: 'chained',
    });

    const capturedError = errorEvent.exception?.values?.[2];
    expect(capturedError?.value).toBe('Failure 3');
    expect(capturedError?.mechanism).toEqual({
      exception_id: 0,
      handled: false,
      type: 'auto.http.hono.context_error',
    });

    expect(errorEvent.transaction).toBe('GET /linked-error');
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

      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          (RUNTIME === 'cloudflare'
            ? getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/http-exception/')
            : getSpanOp(segment) === 'http.server' && segment.name === 'GET /'),
      );

      const response = await fetch(`${baseURL}/http-exception/${code}`, { redirect: 'manual' });
      expect(response.status).toBe(code);

      if (RUNTIME !== 'cloudflare') {
        // Simple request guard for non-Cloudflare runtimes since the other transaction is dropped for 4xx responses
        await fetch(`${baseURL}/`);
      }

      const segment = await segmentPromise;

      if (RUNTIME === 'cloudflare') {
        expect(segment.name).toBe('GET /http-exception/:code');
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

      const segmentPromise = waitForStreamedSpan(
        APP_NAME,
        segment =>
          segment.is_segment &&
          (RUNTIME === 'cloudflare'
            ? getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/http-exception/')
            : getSpanOp(segment) === 'http.server' && segment.name === 'GET /'),
      );

      const response = await fetch(`${baseURL}/http-exception/${code}`);
      expect(response.status).toBe(code);

      if (RUNTIME !== 'cloudflare') {
        // Simple request guard for non-Cloudflare runtimes since the other transaction is dropped for 4xx responses
        await fetch(`${baseURL}/`);
      }

      const segment = await segmentPromise;

      if (RUNTIME === 'cloudflare') {
        expect(segment.name).toBe('GET /http-exception/:code');
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

    const segmentPromise = collectStreamedSpansUntilSegment(
      APP_NAME,
      segment =>
        getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/test-errors/middleware-http-exception'),
    );

    const response = await fetch(`${baseURL}/test-errors/middleware-http-exception`);
    expect(response.status).toBe(503);

    const errorEvent = await errorPromise;
    expect(errorEvent.exception?.values?.[0]?.value).toBe('Service Unavailable from middleware');
    expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe('auto.http.hono.context_error');
    expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);
    expect(errorEvent.transaction).toBe('GET /test-errors/middleware-http-exception');

    const segmentSpans = await segmentPromise;
    const segment = segmentSpans.find(
      segment =>
        segment.is_segment &&
        getSpanOp(segment) === 'http.server' &&
        !!segment.name?.includes('/test-errors/middleware-http-exception'),
    )!;
    const middlewareSpan = segmentSpans
      .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
      .find(s => getSpanOp(s) === 'middleware');
    expect(middlewareSpan?.status).toBe('error');
  });

  test('does not capture 4xx HTTPException thrown in middleware', async ({ baseURL }) => {
    let errorEventOccurred = false;

    waitForError(APP_NAME, event => {
      if (event.exception?.values?.[0]?.value === 'Unauthorized from middleware') {
        errorEventOccurred = true;
      }
      return false;
    });

    const segmentPromise = collectStreamedSpansUntilSegment(APP_NAME, segment => {
      if (RUNTIME === 'cloudflare') {
        return (
          getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/test-errors/middleware-http-exception-4xx')
        );
      }
      return getSpanOp(segment) === 'http.server' && segment.name === 'GET /';
    });

    const response = await fetch(`${baseURL}/test-errors/middleware-http-exception-4xx`);
    expect(response.status).toBe(401);

    if (RUNTIME !== 'cloudflare') {
      await fetch(`${baseURL}/`);
    }

    const segmentSpans = await segmentPromise;
    const segment = segmentSpans.find(segment => {
      if (!segment.is_segment) return false;
      if (RUNTIME === 'cloudflare') {
        return (
          getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/test-errors/middleware-http-exception-4xx')
        );
      }
      return getSpanOp(segment) === 'http.server' && segment.name === 'GET /';
    })!;

    if (RUNTIME === 'cloudflare') {
      expect(segment.name).toBe('GET /test-errors/middleware-http-exception-4xx');

      const middlewareSpan = segmentSpans
        .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
        .find(s => getSpanOp(s) === 'middleware');
      expect(middlewareSpan?.status).not.toBe('error');
    }

    expect(errorEventOccurred).toBe(false);
  });
});

test.describe('nested sub-app errors', () => {
  test('captures error from nested child sub-app', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Nested child app error';
    });

    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/nested/child/error'),
    );

    const response = await fetch(`${baseURL}/test-errors/nested/child/error`);
    expect(response.status).toBe(500);

    const errorEvent = await errorPromise;
    const segment = await segmentPromise;

    expect(segment.name).toBe('GET /test-errors/nested/child/error');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Nested child app error');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
    expect(errorEvent.request?.method).toBe('GET');
    expect(errorEvent.request?.url).toContain('/test-errors/nested/child/error');
    expect(errorEvent.request?.headers).toBeDefined();
  });
});

test.describe('custom onError handler', () => {
  test('captures error even when onError handles the response', async ({ baseURL }) => {
    const errorPromise = waitForError(APP_NAME, event => {
      return event.exception?.values?.[0]?.value === 'Error caught by custom onError';
    });

    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment && getSpanOp(segment) === 'http.server' && !!segment.name?.includes('/custom-on-error/fail'),
    );

    const response = await fetch(`${baseURL}/test-errors/custom-on-error/fail`);
    expect(response.status).toBe(500);

    const body = await response.text();
    expect(body).toContain('Handled by onError');

    const errorEvent = await errorPromise;
    const segment = await segmentPromise;

    expect(segment.name).toBe('GET /test-errors/custom-on-error/fail');

    expect(errorEvent.exception?.values?.[0]?.value).toBe('Error caught by custom onError');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.http.hono.context_error',
    });
  });
});
