import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('captures an error with debug ids and pageload trace context', async ({ page }) => {
  const errorEventPromise = waitForError('browser-webworker-vite', async event => {
    return !event.type && !!event.exception?.values?.[0];
  });

  const transactionPromise = waitForTransaction('browser-webworker-vite', transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  await page.locator('#trigger-error').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  const pageloadTraceId = transactionEvent.contexts?.trace?.trace_id;
  const pageloadSpanId = transactionEvent.contexts?.trace?.span_id;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught Error: Uncaught error in worker');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toMatch(/worker-.+\.js$/);

  expect(errorEvent.transaction).toBe('/');
  expect(transactionEvent.transaction).toBe('/');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadTraceId,
    span_id: pageloadSpanId,
  });

  expect(errorEvent.debug_meta).toEqual({
    images: [
      {
        code_file: expect.stringMatching(/http:\/\/localhost:3030\/assets\/worker-.+\.js/),
        debug_id: expect.stringMatching(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/),
        type: 'sourcemap',
      },
    ],
  });
});

test("user worker message handlers don't trigger for sentry messages", async ({ page }) => {
  const workerReadyPromise = new Promise<number>(resolve => {
    let workerMessageCount = 0;
    page.on('console', msg => {
      if (msg.text().startsWith('received message from worker:')) {
        workerMessageCount++;
      }

      if (msg.text() === 'received message from worker: WORKER_READY') {
        resolve(workerMessageCount);
      }
    });
  });

  await page.goto('/');

  const workerMessageCount = await workerReadyPromise;

  expect(workerMessageCount).toBe(1);
});

test('captures an error from the second eagerly added worker', async ({ page }) => {
  const errorEventPromise = waitForError('browser-webworker-vite', async event => {
    return !event.type && !!event.exception?.values?.[0];
  });

  const transactionPromise = waitForTransaction('browser-webworker-vite', transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  await page.locator('#trigger-error-2').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  const pageloadTraceId = transactionEvent.contexts?.trace?.trace_id;
  const pageloadSpanId = transactionEvent.contexts?.trace?.span_id;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught Error: Uncaught error in worker 2');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toMatch(/worker2-.+\.js$/);

  expect(errorEvent.transaction).toBe('/');
  expect(transactionEvent.transaction).toBe('/');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadTraceId,
    span_id: pageloadSpanId,
  });

  expect(errorEvent.debug_meta).toEqual({
    images: [
      {
        code_file: expect.stringMatching(/http:\/\/localhost:3030\/assets\/worker2-.+\.js/),
        debug_id: expect.stringMatching(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/),
        type: 'sourcemap',
      },
    ],
  });
});

test('captures an error from the third lazily added worker', async ({ page }) => {
  const errorEventPromise = waitForError('browser-webworker-vite', async event => {
    return !event.type && !!event.exception?.values?.[0];
  });

  const transactionPromise = waitForTransaction('browser-webworker-vite', transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  await page.locator('#trigger-error-3').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  const pageloadTraceId = transactionEvent.contexts?.trace?.trace_id;
  const pageloadSpanId = transactionEvent.contexts?.trace?.span_id;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught Error: Uncaught error in worker 3');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toMatch(/worker3-.+\.js$/);

  expect(errorEvent.transaction).toBe('/');
  expect(transactionEvent.transaction).toBe('/');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadTraceId,
    span_id: pageloadSpanId,
  });

  expect(errorEvent.debug_meta).toEqual({
    images: [
      {
        code_file: expect.stringMatching(/http:\/\/localhost:3030\/assets\/worker3-.+\.js/),
        debug_id: expect.stringMatching(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/),
        type: 'sourcemap',
      },
    ],
  });
});

test('worker errors are not tagged as third-party when module metadata is present', async ({ page }) => {
  const errorEventPromise = waitForError('browser-webworker-vite', async event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Uncaught Error: Uncaught error in worker';
  });

  await page.goto('/');

  await page.locator('#trigger-error').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.tags?.third_party_code).toBeUndefined();
});
