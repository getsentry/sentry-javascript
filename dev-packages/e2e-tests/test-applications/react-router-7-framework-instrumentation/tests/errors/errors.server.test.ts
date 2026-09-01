import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - instrumentation API error capture', () => {
  test('should capture loader errors with instrumentation API mechanism', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Loader error for testing';
    });

    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance/error-loader' && span.is_segment;
    });

    await page.goto(`/performance/error-loader`).catch(() => {
      // Expected to fail due to loader error
    });

    const [error, span] = await Promise.all([errorPromise, spanPromise]);

    // Verify the error was captured with correct mechanism and transaction name
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Loader error for testing',
            mechanism: {
              type: 'react_router.loader',
              handled: false,
            },
          },
        ],
      },
      transaction: 'GET /performance/error-loader',
    });

    // Verify the transaction was also created with correct attributes
    expect(span.name).toBe('GET /performance/error-loader');
    expect(getSpanOp(span)).toBe('http.server');
    expect(span.attributes['sentry.origin']?.value).toBe('auto.http.react_router.instrumentation_api');
  });

  test('should include loader span in the segment even when loader throws', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/error-loader' && span.is_segment);
    });

    await page.goto(`/performance/error-loader`).catch(() => {
      // Expected to fail due to loader error
    });

    const spans = await spansPromise;

    // Find the loader span
    const loaderSpan = spans.find(span => span.attributes['code.function.name']?.value === 'loader');

    expect(loaderSpan).toBeDefined();
    expect(getSpanOp(loaderSpan!)).toBe('function');
    expect(loaderSpan!.attributes).toMatchObject({
      'sentry.origin': { value: 'auto.function.react_router.instrumentation_api', type: 'string' },
      'sentry.op': { value: 'function', type: 'string' },
      'code.function.name': { value: 'loader', type: 'string' },
    });
  });

  test('error and segment span should share the same trace', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Loader error for testing';
    });

    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance/error-loader' && span.is_segment;
    });

    await page.goto(`/performance/error-loader`).catch(() => {
      // Expected to fail due to loader error
    });

    const [error, span] = await Promise.all([errorPromise, spanPromise]);

    // Error and segment span should have the same trace_id
    expect(error.contexts?.trace?.trace_id).toBe(span.trace_id);
  });

  // Skipped in dev: the action error is sometimes captured via the client instrumentation path
  // (mechanism `react_router.client_action`, client-side transaction name) rather than the server
  // `react_router.action` / `POST ...` asserted here, making this flaky in dev. Server-mechanism
  // error capture in dev is still covered by the loader/middleware error tests above.
  test('should capture action errors with instrumentation API mechanism', async ({ page }) => {
    test.skip(process.env.TEST_ENV === 'development', 'Action error capture races the client path in dev');

    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Action error for testing';
    });

    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'POST /performance/error-action' && span.is_segment;
    });

    await page.goto(`/performance/error-action`);
    await page.getByRole('button', { name: 'Trigger Error' }).click();

    const [error, span] = await Promise.all([errorPromise, spanPromise]);

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Action error for testing',
            mechanism: {
              type: 'react_router.action',
              handled: false,
            },
          },
        ],
      },
      transaction: 'POST /performance/error-action',
    });

    expect(span.name).toBe('POST /performance/error-action');
    expect(getSpanOp(span)).toBe('http.server');
    expect(span.attributes['sentry.origin']?.value).toBe('auto.http.react_router.instrumentation_api');
  });

  test('should capture middleware errors with instrumentation API mechanism', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Middleware error for testing';
    });

    const spanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance/error-middleware' && span.is_segment;
    });

    await page.goto(`/performance/error-middleware`).catch(() => {
      // Expected to fail due to middleware error
    });

    const [error, span] = await Promise.all([errorPromise, spanPromise]);

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Middleware error for testing',
            mechanism: {
              type: 'react_router.middleware',
              handled: false,
            },
          },
        ],
      },
      transaction: 'GET /performance/error-middleware',
    });

    expect(span.name).toBe('GET /performance/error-middleware');
    expect(getSpanOp(span)).toBe('http.server');
    expect(span.attributes['sentry.origin']?.value).toBe('auto.http.react_router.instrumentation_api');
  });
});
