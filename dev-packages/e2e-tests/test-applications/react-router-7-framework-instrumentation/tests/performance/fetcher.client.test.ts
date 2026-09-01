import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// As of React Router 7.15+, HydratedRouter invokes the client `fetch` hook in Framework Mode.
// A fetcher submission produces a `function` span (origin
// `auto.function.react_router.instrumentation_api`, `code.function.name` `fetcher`) that nests the
// client action/loader spans and the `http.client` spans for the underlying `.data` requests.
// See: https://github.com/remix-run/react-router/discussions/13749

/** Every span below `rootSpan`, following `parent_span_id` down the tree. */
function descendantsOf(spans: SerializedStreamedSpan[], rootSpan: SerializedStreamedSpan): SerializedStreamedSpan[] {
  const descendants: SerializedStreamedSpan[] = [];
  const parentIds = new Set([rootSpan.span_id]);

  // Streamed spans arrive parents-last, so keep sweeping until no new descendant is found.
  let foundNew = true;
  while (foundNew) {
    foundNew = false;
    for (const span of spans) {
      if (span.parent_span_id && parentIds.has(span.parent_span_id) && !parentIds.has(span.span_id)) {
        parentIds.add(span.span_id);
        descendants.push(span);
        foundNew = true;
      }
    }
  }

  return descendants;
}

test.describe('client - instrumentation API fetcher', () => {
  test('should instrument fetcher with instrumentation API origin', async ({ page }) => {
    // Wait for the client pageload to finish so HydratedRouter is hydrated and the fetcher
    // submission goes through the instrumented client `fetch` path (not a full-document POST).
    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/fetcher-test' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      const fetcherSpan = spans.find(span => span.attributes['code.function.name']?.value === 'fetcher');
      return !!fetcherSpan && descendantsOf(spans, fetcherSpan).some(span => getSpanOp(span) === 'http.client');
    });

    await page.goto(`/performance/fetcher-test`);
    await pageloadSpanPromise;

    await page.locator('#fetcher-submit').click();

    const spans = await spansPromise;
    const fetcherSpan = spans.find(span => span.attributes['code.function.name']?.value === 'fetcher')!;

    expect(fetcherSpan.attributes['sentry.origin']?.value).toBe('auto.function.react_router.instrumentation_api');

    // The fetcher span nests the client action span and the http.client span(s) for the underlying
    // `.data` request(s) - i.e. the browser fetch span is parented by the fetcher span, not emitted
    // standalone.
    const childSpans = descendantsOf(spans, fetcherSpan);
    expect(childSpans.some(span => span.attributes['code.function.name']?.value === 'clientAction')).toBe(true);
    expect(childSpans.map(span => getSpanOp(span))).toContain('http.client');
  });

  test('should still send server action span when fetcher submits', async ({ page }) => {
    const serverPageloadPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'GET /performance/fetcher-test' && getSpanOp(span) === 'http.server' && span.is_segment;
    });

    await page.goto(`/performance/fetcher-test`);
    await serverPageloadPromise;

    // Fetcher submit triggers a server action
    const serverActionPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === 'POST /performance/fetcher-test' && getSpanOp(span) === 'http.server' && span.is_segment;
    });

    await page.locator('#fetcher-submit').click();

    const serverActionSpan = await serverActionPromise;

    expect(serverActionSpan.name).toBe('POST /performance/fetcher-test');
    expect(serverActionSpan.attributes['sentry.origin']?.value).toBe('auto.http.react_router.instrumentation_api');

    // Verify fetcher result is displayed
    await expect(page.locator('#fetcher-result')).toHaveText('Fetcher result: test-value');
  });
});
