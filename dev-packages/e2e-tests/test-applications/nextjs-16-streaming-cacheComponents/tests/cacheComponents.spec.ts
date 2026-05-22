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

test('Metatag injection produces exactly one pageload trace with cache components', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-16-streaming-cacheComponents', span => {
    return span.name === 'GET /pageload-tracing' && getSpanOp(span) === 'http.server' && span.is_segment;
  });

  const pageloadSpanPromise = waitForStreamedSpan('nextjs-16-streaming-cacheComponents', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  // Server and client pageload spans must share the same trace via metatag injection
  expect(pageloadSpan.trace_id).toBeTruthy();
  expect(serverSpan.trace_id).toBe(pageloadSpan.trace_id);

  // Exactly one set of trace meta tags — no duplicates that would cause multiple pageloads
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(1);
  expect(await page.locator('meta[name="baggage"]').count()).toBe(1);
});
