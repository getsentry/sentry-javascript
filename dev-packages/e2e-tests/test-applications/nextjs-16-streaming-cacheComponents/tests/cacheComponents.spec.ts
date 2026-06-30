import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, waitForStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('Should render cached component', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-streaming-cacheComponents', spans => {
    return spans.some(
      span => span.name.startsWith('GET /cache') && getSpanOp(span) === 'http.server' && span.is_segment,
    );
  });

  await page.goto('/cache');

  const spans = await spansPromise;

  // we want to skip creating spans in cached environments
  expect(spans.filter(span => getSpanOp(span) === 'get.todos')).toHaveLength(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
});

test('Should render suspense component', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-streaming-cacheComponents', spans => {
    return spans.some(
      span => span.name.startsWith('GET /suspense') && getSpanOp(span) === 'http.server' && span.is_segment,
    );
  });

  await page.goto('/suspense');

  const spans = await spansPromise;

  // this will be called several times in development mode, so we need to check for at least one span
  expect(spans.filter(span => getSpanOp(span) === 'get.todos').length).toBeGreaterThan(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
});

test('Should generate metadata', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-streaming-cacheComponents', spans => {
    return spans.some(
      span => span.name.startsWith('GET /metadata') && getSpanOp(span) === 'http.server' && span.is_segment,
    );
  });

  await page.goto('/metadata');

  const spans = await spansPromise;

  expect(spans.filter(span => getSpanOp(span) === 'get.todos')).toHaveLength(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
  await expect(page).toHaveTitle('Cache Components Metadata Test');
});

test('Should generate metadata async', async ({ page }) => {
  const spansPromise = waitForStreamedSpans('nextjs-16-streaming-cacheComponents', spans => {
    return spans.some(
      span => span.name.startsWith('GET /metadata-async') && getSpanOp(span) === 'http.server' && span.is_segment,
    );
  });

  await page.goto('/metadata-async');

  const spans = await spansPromise;

  expect(spans.filter(span => getSpanOp(span) === 'get.todos')).toHaveLength(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
  await expect(page).toHaveTitle('Product: 1');
});

test('Prerendered shell does not stitch the pageload onto a stale trace', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16-streaming-cacheComponents', span => {
    return span.name === 'GET /pageload-tracing' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-streaming-cacheComponents', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  // Under Cache Components the can be prerendered and rendered in a context detached from the
  // runtime server request, so a `sentry-trace` meta tag would carry a stale/unrelated trace. The
  // SDK therefore does not enable the trace meta tags, and the browser pageload starts a fresh trace
  // instead of stitching onto a trace that doesn't match the server request.
  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(serverSpan.trace_id).not.toBe(pageloadSpan.trace_id);

  // No trace meta tags should be injected when Cache Components is enabled.
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
});
