import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'nextjs-16-streaming-cacheComponents';

// The server only writes `sentry-trace` meta tags for a render that happened for the current request,
// never while it prerenders a shell. So a tag in the document can always be continued; the only
// question is when it arrives. The resumed part of a prerendered shell arrives after the SDK started,
// which the pageload instrumentation waits for.

test('connects the pageload trace to the runtime server request', async ({ page }) => {
  // The shell is prerendered, but the page's dynamic part (`DynamicContent` awaits `headers()`)
  // runs on the server on every request and produces the `GET /pageload-tracing` root span.
  const serverSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === 'GET /pageload-tracing' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(serverSpan.trace_id).toBeTruthy();
  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
  expect(pageloadSpan.links).toBeUndefined();
});

test('connects the pageload trace to a blocking render', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === 'GET /blocking' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === '/blocking' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/blocking');

  await expect(page.locator('#blocking')).toHaveText('Blocking render for a browser');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  // The whole page renders per request, so the tag in <head> is this request's and is continued.
  expect(serverSpan.trace_id).toBeTruthy();
  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
  expect(pageloadSpan.links).toBeUndefined();
});

test('does not share a trace between visitors of a shell generated at request time', async ({ browser }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Shells are only cached in production builds');

  // `[id]` only lists `test` in `generateStaticParams`, so the first visit prerenders and caches the
  // shell for this id. The prerender writes no trace tag, so every visitor starts a fresh trace.
  const id = `shell-${Date.now()}`;

  const visit = async (): Promise<{ traceId: string | undefined; links: unknown }> => {
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
      return getSpanOp(span) === 'pageload' && span.is_segment && span.attributes['url.path']?.value === `/${id}`;
    });

    await page.goto(`/${id}`);
    await expect(page.locator('#result')).toHaveText(`Hello, ${id}!`);
    expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);

    const pageloadSpan = await pageloadSpanPromise;
    await context.close();

    return { traceId: pageloadSpan.trace_id, links: pageloadSpan.links };
  };

  const first = await visit();
  const second = await visit();

  expect(first.traceId).toBeTruthy();
  expect(second.traceId).toBeTruthy();
  expect(second.traceId).not.toBe(first.traceId);
  expect(first.links).toBeUndefined();
  expect(second.links).toBeUndefined();
});

test('starts a fresh trace on a fully static page', async ({ page }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Pages are only prerendered in production builds');

  const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === '/static-shell' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/static-shell');

  await expect(page.locator('#static-shell')).toHaveText('Static shell');

  const pageloadSpan = await pageloadSpanPromise;

  // A build-time shell carries no trace context at all.
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(pageloadSpan.links).toBeUndefined();
});
