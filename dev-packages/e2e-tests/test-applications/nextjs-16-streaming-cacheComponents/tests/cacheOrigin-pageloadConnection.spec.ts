import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'nextjs-16-streaming-cacheComponents';

// The server only writes `sentry-trace` meta tags for a render that happened for the current request,
// never while it prerenders a shell. So a tag in the document can always be continued; the only
// question is when it arrives. The resumed part of a prerendered shell arrives after the SDK started,
// which the pageload instrumentation waits for. A shell prerendered at runtime carries a
// `sentry-cache-origin` tag instead, which marks the pageload as static and links the prerender.

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
  // shell for this id. The prerender writes no trace tag, only a `sentry-cache-origin` tag with its own
  // trace, so every visitor starts a fresh trace that links the prerender and is marked as static.
  const id = `shell-${Date.now()}`;

  const visit = async (): Promise<{ traceId: string | undefined; links: unknown; serverRenderingType: unknown }> => {
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
      return getSpanOp(span) === 'pageload' && span.is_segment && span.attributes['url.path']?.value === `/${id}`;
    });

    await page.goto(`/${id}`);
    await expect(page.locator('#result')).toHaveText(`Hello, ${id}!`);
    expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
    expect(await page.locator('meta[name="sentry-cache-origin"]').count()).toBe(1);

    const pageloadSpan = await pageloadSpanPromise;
    await context.close();

    return {
      traceId: pageloadSpan.trace_id,
      links: pageloadSpan.links,
      serverRenderingType: pageloadSpan.attributes['page.server_rendering.type']?.value,
    };
  };

  const first = await visit();
  const second = await visit();

  expect(first.traceId).toBeTruthy();
  expect(second.traceId).toBeTruthy();
  expect(second.traceId).not.toBe(first.traceId);
  expect(first.serverRenderingType).toBe('static');
  expect(second.serverRenderingType).toBe('static');

  // Both link the request that prerendered the shell, which is the first visitor's own request. The
  // client cannot tell the first visit from later ones, so that pageload starts a fresh trace too.
  const linkOf = (links: unknown): { trace_id: string; attributes?: Record<string, { value: unknown }> } => {
    const link = (links as Array<{ trace_id: string; attributes?: Record<string, { value: unknown }> }>)[0];
    expect(link?.attributes?.[SENTRY_LINK_TYPE]?.value).toBe('cache_origin');
    return link!;
  };
  expect(linkOf(first.links).trace_id).toBe(linkOf(second.links).trace_id);
  expect(linkOf(second.links).trace_id).not.toBe(second.traceId);
});

test('continues the request trace on a shell prerendered at runtime and links the prerender', async ({
  browser,
  page,
  baseURL,
}) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Shells are only cached in production builds');

  // The shell from the build carries no `sentry-cache-origin` tag. Wait until a visit serves the
  // shell that the server prerendered again at runtime.
  const warmup = await browser.newPage();
  await warmup.goto('/runtime-shell');
  const renderedAtBuild = await warmup.locator('#rendered-at').textContent();
  await expect
    .poll(
      async () => {
        await warmup.waitForTimeout(1500);
        await warmup.goto('/runtime-shell');
        return warmup.locator('#rendered-at').textContent();
      },
      { timeout: 30_000 },
    )
    .not.toBe(renderedAtBuild);
  await warmup.close();

  const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
    return (
      getSpanOp(span) === 'pageload' &&
      span.is_segment &&
      span.attributes['url.full']?.value === `${baseURL}/runtime-shell?visit=last`
    );
  });

  await page.goto('/runtime-shell?visit=last');
  await expect(page.locator('#request-content')).toHaveText('Rendered for this request');
  const [requestTraceId] = (await page.locator('meta[name="sentry-trace"]').getAttribute('content'))!.split('-');
  const [prerenderTraceId, prerenderSpanId] = (await page
    .locator('meta[name="sentry-cache-origin"]')
    .getAttribute('content'))!.split('-');

  const pageloadSpan = await pageloadSpanPromise;

  // Only the shell came from the cache. The rest of the page rendered for this request, and the
  // pageload continues that trace.
  expect(pageloadSpan.trace_id).toBe(requestTraceId);
  expect(pageloadSpan.attributes['page.server_rendering.type']?.value).toBe('partially_static');
  expect(pageloadSpan.links).toEqual([
    {
      trace_id: prerenderTraceId,
      span_id: prerenderSpanId,
      sampled: true,
      attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'cache_origin' } },
    },
  ]);
  expect(prerenderTraceId).not.toBe(requestTraceId);
});

test('starts a fresh trace on a fully static page', async ({ page }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Pages are only prerendered in production builds');

  const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === '/static-shell' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/static-shell');

  await expect(page.locator('#static-shell')).toHaveText('Static shell');

  const pageloadSpan = await pageloadSpanPromise;

  // A build-time shell carries no trace context and no marker, the SDK does not run during the build.
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  expect(await page.locator('meta[name="sentry-cache-origin"]').count()).toBe(0);
  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(pageloadSpan.links).toBeUndefined();
  expect(pageloadSpan.attributes['page.server_rendering.type']).toBeUndefined();
});

test('keeps a navigation that starts while the pageload waits for the trace meta tag', async ({ page }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Only a prerendered shell makes the trace meta tag arrive late');

  const pageloadSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === '/slow-hole' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan(APP, span => {
    return span.name === '/static-shell' && getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto('/slow-hole', { waitUntil: 'commit' });
  await page.waitForFunction(() => !!(window as { next?: { router?: unknown } }).next?.router);

  // The resumed part, which carries the tag, has not arrived yet, so the pageload is still waiting.
  await expect(page.locator('#slow-fallback')).toBeVisible();
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);

  await page.locator('#navigate').click();
  await expect(page.locator('#static-shell')).toHaveText('Static shell');

  const [pageloadSpan, navigationSpan] = await Promise.all([pageloadSpanPromise, navigationSpanPromise]);

  // The navigation ends the pageload like any pageload it interrupts, and runs to its own idle timeout.
  expect(pageloadSpan.attributes['sentry.idle_span_finish_reason']).toEqual({ type: 'string', value: 'cancelled' });
  expect(navigationSpan.attributes['sentry.idle_span_finish_reason']).toEqual({
    type: 'string',
    value: 'idleTimeout',
  });
});
