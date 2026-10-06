import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

const APP_NAME = 'hydrogen-react-router-7';

test.describe.configure({ mode: 'serial' });

test('Sends a parameterized span name to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => {
    // The span name is parameterized (route pattern, not the actual URL).
    return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /user/:id';
  });

  await page.goto('/user/123');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Sends two linked spans (server & client) to Sentry', async ({ page }) => {
  // Streamed spans are buffered before they flush, so spans from an earlier page load can still be
  // arriving here. The document advertises its own trace in the `sentry-trace` meta tag, so that is
  // what tells this page load's spans apart rather than the op or the URL.
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  await page.goto('/');

  const sentryTrace = await page.getAttribute('meta[name="sentry-trace"]', 'content');
  const [traceId] = (sentryTrace ?? '').split('-');
  expect(traceId).toMatch(/^[a-f0-9]{32}$/);

  const findServerSegmentSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'http.server' && span.is_segment && span.trace_id === traceId);
  await expect.poll(findServerSegmentSpan).toBeDefined();
  expect(findServerSegmentSpan()!.name).toBe('GET /');

  const findPageloadSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'pageload' && span.is_segment && span.trace_id === traceId);
  await expect.poll(findPageloadSpan).toBeDefined();
  expect(findPageloadSpan()!.name).toBe('/');
  expect(findPageloadSpan()!.span_id).not.toBe(findServerSegmentSpan()!.span_id);
});
