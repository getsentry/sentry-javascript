import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpans } from '@sentry-internal/test-utils';

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

// Capturing an event inside a Server Component that is (re)generated at request time must not
// trip Next.js Cache Components prerender guards (`new Date()` / `crypto`).
test('Should capture an exception from an on-demand generated Server Component', async ({ page }) => {
  const errorPromise = waitForError('nextjs-16-streaming-cacheComponents', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Test error from cache components page';
  });

  await page.goto('/exception');

  await expect(page.locator('#result')).toHaveText('Error captured for id exception');

  const error = await errorPromise;
  expect(error.exception?.values?.[0]?.value).toBe('Test error from cache components page');
});

test('Should capture a message from an on-demand generated Server Component', async ({ page }) => {
  const messagePromise = waitForError('nextjs-16-streaming-cacheComponents', errorEvent => {
    return errorEvent.message === 'Test message from cache components page';
  });

  await page.goto('/message');

  await expect(page.locator('#result')).toHaveText('Message captured for id message');

  const message = await messagePromise;
  expect(message.message).toBe('Test message from cache components page');
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

test('Should prerender a page that captures an exception in generateMetadata', async ({ page }) => {
  await page.goto('/capture-metadata');

  await expect(page).toHaveTitle('capture-metadata');
  await expect(page.locator('h1')).toHaveText('capture-metadata');
});
