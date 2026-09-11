import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

function waitForPageloadSpan() {
  return waitForStreamedSpan('browser-webworker-vite', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });
}

// The throw still bubbles to the page after the worker forwards it, but
// the integration makes globalHandlers skip that frameless copy. So the
// first error event to arrive must be the forwarded one.
const WORKER_MECHANISM = 'auto.browser.web_worker.onerror';

test('captures an error with debug ids and pageload trace context', async ({ page }) => {
  const errorEventPromise = waitForError('browser-webworker-vite', async event => {
    return !event.type && !!event.exception?.values?.[0];
  });

  const pageloadSpanPromise = waitForPageloadSpan();

  await page.goto('/');

  await page.locator('#trigger-error').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe(WORKER_MECHANISM);
  expect(errorEvent.exception?.values?.[0]?.type).toBe('Error');
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught error in worker');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
    expect.arrayContaining([expect.objectContaining({ filename: expect.stringMatching(/worker-.+\.js$/) })]),
  );

  expect(errorEvent.contexts?.worker).toEqual({
    filename: expect.stringMatching(/worker-.+\.js$/),
  });

  expect(errorEvent.transaction).toBe('/');
  expect(pageloadSpan.name).toBe('Pageload');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadSpan.trace_id,
    span_id: pageloadSpan.span_id,
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

test('emits exactly one event for an uncaught worker error', async ({ page }) => {
  const mechanisms: Array<string | undefined> = [];
  // Never resolves. It only records every error event that arrives, so
  // the global handler's copy of a throw would show up here.
  void waitForError('browser-webworker-vite', event => {
    if (!event.type && event.exception?.values?.[0]) {
      mechanisms.push(event.exception.values[0].mechanism?.type);
    }
    return false;
  });

  const firstErrorPromise = waitForError('browser-webworker-vite', event => {
    return event.exception?.values?.[0]?.value === 'Uncaught error in worker';
  });
  const secondErrorPromise = waitForError('browser-webworker-vite', event => {
    return event.exception?.values?.[0]?.value === 'Uncaught error in worker 2';
  });

  await page.goto('/');

  await page.locator('#trigger-error').click();
  await firstErrorPromise;

  // The bubbled copy of the first throw is queued right behind the forwarded
  // one, so the second worker's event arriving without it in between is the
  // signal that it was suppressed.
  await page.locator('#trigger-error-2').click();
  await secondErrorPromise;

  expect(mechanisms).toEqual([WORKER_MECHANISM, WORKER_MECHANISM]);
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

  const pageloadSpanPromise = waitForPageloadSpan();

  await page.goto('/');

  await page.locator('#trigger-error-2').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe(WORKER_MECHANISM);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught error in worker 2');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
    expect.arrayContaining([expect.objectContaining({ filename: expect.stringMatching(/worker2-.+\.js$/) })]),
  );

  expect(errorEvent.transaction).toBe('/');
  expect(pageloadSpan.name).toBe('Pageload');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadSpan.trace_id,
    span_id: pageloadSpan.span_id,
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

  const pageloadSpanPromise = waitForPageloadSpan();

  await page.goto('/');

  await page.locator('#trigger-error-3').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe(WORKER_MECHANISM);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Uncaught error in worker 3');
  expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
    expect.arrayContaining([expect.objectContaining({ filename: expect.stringMatching(/worker3-.+\.js$/) })]),
  );

  expect(errorEvent.transaction).toBe('/');
  expect(pageloadSpan.name).toBe('Pageload');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: pageloadSpan.trace_id,
    span_id: pageloadSpan.span_id,
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
    return !event.type && event.exception?.values?.[0]?.value === 'Uncaught error in worker';
  });

  await page.goto('/');

  await page.locator('#trigger-error').click();

  await page.waitForTimeout(1000);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.tags?.third_party_code).toBeUndefined();
});
