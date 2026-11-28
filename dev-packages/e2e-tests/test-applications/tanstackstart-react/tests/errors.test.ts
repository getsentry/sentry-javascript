import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForError,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';
import {
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_ID,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { FUNCTION, HTTP_SERVER, PAGELOAD } from '@sentry/conventions/op';

test('Sends client-side error to Sentry with auto-instrumentation', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Sentry Client Test Error';
  });
  const spansPromise = collectStreamedSpansUntilSegment(
    'tanstackstart-react',
    span => getSpanOp(span) === PAGELOAD && span.name === '/',
  );

  await page.goto(`/`);

  // Wait for React to hydrate (see __root.tsx) before clicking — the SSR HTML
  // renders the button before the onClick handler is attached, and clicking
  // pre-hydration would fire no handler and produce no error.
  await page.locator('html[data-hydrated="true"]').waitFor();

  await expect(page.locator('button').filter({ hasText: 'Break the client' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break the client' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Client Test Error',
          mechanism: {
            handled: false,
          },
        },
      ],
    },
  });

  const pageloadSpan = (await spansPromise).find(span => span.is_segment && getSpanOp(span) === PAGELOAD)!;
  expect(pageloadSpan.attributes[SENTRY_SEGMENT_NAME_SOURCE]).toEqual({ type: 'string', value: 'route' });
  expect(errorEvent.contexts?.trace?.trace_id).toBe(pageloadSpan.trace_id);
});

test('Sends server-side function error to Sentry with auto-instrumentation', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    // The thrown error propagates back to the client over the server-function RPC and is also
    // captured there as an `onunhandledrejection` with the same message. Match on the server-function
    // mechanism so we deterministically pick the server-side event instead of racing the client one.
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Sentry Server Function Test Error' &&
      errorEvent?.exception?.values?.[0]?.mechanism?.type === 'auto.middleware.tanstackstart.server_function'
    );
  });
  const spansPromise = collectStreamedSpansUntilSegment(
    'tanstackstart-react',
    span => getSpanOp(span) === HTTP_SERVER && String(span.attributes[URL_PATH]?.value).startsWith('/_serverFn/'),
    span =>
      getSpanOp(span) === FUNCTION && span.attributes[SENTRY_ORIGIN]?.value === 'auto.function.tanstackstart.server',
  );

  await page.goto(`/`);

  await expect(page.locator('button').filter({ hasText: 'Break server function' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break server function' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Server Function Test Error',
          mechanism: {
            type: 'auto.middleware.tanstackstart.server_function',
            handled: false,
          },
        },
      ],
    },
  });

  const spans = await spansPromise;
  const segmentSpan = spans.find(
    span => span.is_segment && String(span.attributes[URL_PATH]?.value).startsWith('/_serverFn/'),
  )!;
  const functionSpan = spans.find(
    span =>
      getSpanOp(span) === FUNCTION && span.attributes[SENTRY_ORIGIN]?.value === 'auto.function.tanstackstart.server',
  )!;
  expect(functionSpan.attributes[SENTRY_SEGMENT_ID]).toEqual({ type: 'string', value: segmentSpan.span_id });
  expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentSpan.trace_id);
  expect(
    spans.filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === segmentSpan.span_id).map(span => span.span_id),
  ).toContain(errorEvent.contexts?.trace?.span_id);
});

test('Sends API route error to Sentry with auto-instrumentation', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react', errorEvent => {
    // As with the server-function test, guard against a same-message client-side duplicate by
    // matching the server request mechanism, so we always assert against the server-side event.
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Sentry API Route Test Error' &&
      errorEvent?.exception?.values?.[0]?.mechanism?.type === 'auto.middleware.tanstackstart.request'
    );
  });
  const spansPromise = collectStreamedSpansUntilSegment('tanstackstart-react', 'GET /api/error');

  await page.goto(`/`);

  await expect(page.locator('button').filter({ hasText: 'Break API route' })).toBeVisible();

  await page.locator('button').filter({ hasText: 'Break API route' }).click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry API Route Test Error',
          mechanism: {
            type: 'auto.middleware.tanstackstart.request',
            handled: false,
          },
        },
      ],
    },
  });

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/error')!;
  expect(segmentSpan.attributes).toMatchObject({
    [SENTRY_OP]: { type: 'string', value: HTTP_SERVER },
    [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'route' },
    [HTTP_ROUTE]: { type: 'string', value: '/api/error' },
  });
  expect(errorEvent.contexts?.trace?.trace_id).toBe(segmentSpan.trace_id);
  expect(
    spans.filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === segmentSpan.span_id).map(span => span.span_id),
  ).toContain(errorEvent.contexts?.trace?.span_id);
});

// the sentry global middleware does not capture errors from SSR loader errors since they are serialized before they reach the middleware layer
// this test verifies that the error is in fact not sent to Sentry
test('Does not send SSR loader error to Sentry', async ({ baseURL, page }) => {
  let errorEventOccurred = false;

  waitForError('tanstackstart-react', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Sentry SSR Test Error') {
      errorEventOccurred = true;
    }
    return false;
  });

  const serverSpanPromise = waitForStreamedSpan('tanstackstart-react', span => {
    return span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/ssr-error';
  });

  await page.goto('/ssr-error');

  await serverSpanPromise;

  await (await fetch(`${baseURL}/api/flush`)).text();

  expect(errorEventOccurred).toBe(false);
});
