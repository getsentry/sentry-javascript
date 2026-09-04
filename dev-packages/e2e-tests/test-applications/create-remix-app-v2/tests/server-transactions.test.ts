import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

test('Sends a parameterized span name to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-v2', span => {
    return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET user/:id';
  });

  await page.goto('/user/123');

  const span = await spanPromise;

  expect(span.attributes['http.route']?.value).toBe('user/:id');
});

test('Links the server and client spans of one page load', async ({ page }) => {
  // Streamed spans are buffered before they flush, so spans from an earlier page load can still be
  // arriving here. The document advertises its own trace in the `sentry-trace` meta tag, so that is
  // what tells this page load's spans apart rather than the op or the URL.
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans('create-remix-app-v2', spans => {
    streamedSpans.push(...spans);
    return false;
  });

  await page.goto('/');

  // Remix injects the meta tag from inside the root loader, so the span it names is the loader span.
  const sentryTrace = await page.getAttribute('meta[name="sentry-trace"]', 'content');
  const [traceId, loaderSpanId] = (sentryTrace ?? '').split('-');
  expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  expect(loaderSpanId).toMatch(/^[a-f0-9]{16}$/);

  // The client continues the server trace, so its pageload span hangs off the span the meta tag
  // names. Selecting it that way, rather than by op, is what makes the trace assertion below mean
  // something: a pageload that failed to continue the trace would have no parent at all.
  const findPageloadSpan = () =>
    streamedSpans.find(
      span => getSpanOp(span) === 'pageload' && span.is_segment && span.parent_span_id === loaderSpanId,
    );
  await expect.poll(findPageloadSpan).toBeDefined();
  expect(findPageloadSpan()!.trace_id).toBe(traceId);
  expect(findPageloadSpan()!.name).toBe('/');

  const findServerSegmentSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'http.server' && span.is_segment && span.trace_id === traceId);
  await expect.poll(findServerSegmentSpan).toBeDefined();
  expect(findPageloadSpan()!.span_id).not.toBe(findServerSegmentSpan()!.span_id);

  const findLoaderSpan = () => streamedSpans.find(span => span.span_id === loaderSpanId);
  await expect.poll(findLoaderSpan).toBeDefined();
  expect(findLoaderSpan()!.attributes['code.function.name']?.value).toBe('loader');
});
