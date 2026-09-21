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

  // Page listeners on the worker object still get the native event, once.
  expect(await page.evaluate(() => (window as any).workerErrorEvents)).toEqual([
    { message: 'Uncaught Error: Uncaught error in worker', hasError: false },
  ]);

  // A bubbled copy of the first throw would have been reported before the
  // second worker's event, so its absence here shows it never happened.
  await page.locator('#trigger-error-2').click();
  await secondErrorPromise;

  expect(mechanisms).toEqual([WORKER_MECHANISM, WORKER_MECHANISM]);
});

test('locates a thrown primitive by its ErrorEvent position', async ({ page }) => {
  const errorEventPromise = waitForError('browser-webworker-vite', event => {
    return event.exception?.values?.[0]?.value === 'Primitive thrown in worker';
  });

  await page.goto('/');

  await page.locator('#trigger-primitive-error').click();

  const errorEvent = await errorEventPromise;
  const exception = errorEvent.exception?.values?.[0];

  expect(exception?.mechanism?.type).toBe(WORKER_MECHANISM);
  expect(exception?.stacktrace?.frames).toEqual([
    {
      filename: expect.stringMatching(/worker-.+\.js$/),
      lineno: expect.any(Number),
      colno: expect.any(Number),
      function: '?',
      in_app: true,
    },
  ]);
  expect(exception?.stacktrace?.frames?.[0]?.lineno).toBeGreaterThan(0);
  expect(exception?.stacktrace?.frames?.[0]?.colno).toBeGreaterThan(0);
});

test('emits exactly one event for an error thrown during worker startup', async ({ page }) => {
  const values: Array<string | undefined> = [];
  void waitForError('browser-webworker-vite', event => {
    const value = event.exception?.values?.[0]?.value;
    if (value?.includes('Uncaught error during worker startup')) {
      values.push(value);
    }
    return false;
  });

  const startupErrorPromise = waitForError('browser-webworker-vite', event => {
    return !!event.exception?.values?.[0]?.value?.includes('Uncaught error during worker startup');
  });
  const laterErrorPromise = waitForError('browser-webworker-vite', event => {
    return event.exception?.values?.[0]?.value === 'Uncaught error in worker';
  });

  await page.goto('/');

  await page.locator('#trigger-startup-error').click();
  await startupErrorPromise;

  // Any duplicate of the startup error is sent long before this later error.
  await page.locator('#trigger-error').click();
  await laterErrorPromise;

  expect(values).toHaveLength(1);
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
