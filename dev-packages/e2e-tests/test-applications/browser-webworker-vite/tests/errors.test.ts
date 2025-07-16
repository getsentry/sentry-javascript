import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const E2E_TEST_APP_NAME = 'browser-webworker-vite';

test('captures an error with debug ids and pageload trace context', async ({ page }) => {
  const errorEventPromise = waitForError(E2E_TEST_APP_NAME, event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Uncaught error in worker';
  });

  const transactionPromise = waitForTransaction(E2E_TEST_APP_NAME, transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  await page.locator('id=trigger-error').click();

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  const pageloadTraceId = transactionEvent.contexts?.trace?.trace_id;
  const pageloadSpanId = transactionEvent.contexts?.trace?.span_id;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught error in worker');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toContain('worker.js');

  expect(errorEvent.transaction).toBe('/');
  expect(transactionEvent.transaction).toBe('/');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:4173/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadTraceId,
    span_id: pageloadSpanId,
  });

  expect(errorEvent.debug_meta).toEqual({
    sourcemaps: {
      'worker.js': {
        version: expect.any(String),
        url: expect.any(String),
      },
    },
  });
});
