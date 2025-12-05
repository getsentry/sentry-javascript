import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

// In dev mode, worker files are served as .ts with query params
// In prod mode, worker files are bundled as .js with hashes
const WORKER_FILENAME_PATTERN = /worker(-.+\.js|\\.ts\?worker_file)/;
const WORKER2_FILENAME_PATTERN = /worker2(-.+\.js|\\.ts\?worker_file)/;
const WORKER3_FILENAME_PATTERN = /worker3(-.+\.js|\\.ts\?worker_file)/;

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
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toMatch(WORKER_FILENAME_PATTERN);

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
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toMatch(WORKER2_FILENAME_PATTERN);

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
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toMatch(WORKER3_FILENAME_PATTERN);

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
});
