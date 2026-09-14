import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

function isServerFnSegment(span: Parameters<typeof getSpanOp>[0]): boolean {
  return (
    !!span.is_segment &&
    getSpanOp(span) === 'http.server' &&
    String(span.attributes['url.path']?.value ?? '').startsWith('/_serverFn')
  );
}

test('Sends a server function span with wrapFetchWithSentry', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'tanstackstart-react-cloudflare',
    spans => spans.some(isServerFnSegment) && spans.some(span => span.name === 'GET /_serverFn/testLog'),
  );

  await page.goto('/test-serverFn');

  await expect(page.locator('#server-fn-btn')).toBeVisible();

  await page.locator('#server-fn-btn').click();

  const spans = await spansPromise;

  const serverSegment = spans.find(isServerFnSegment);
  expect(serverSegment?.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.origin': { type: 'string', value: 'auto.http.cloudflare' },
  });

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'GET /_serverFn/testLog',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.function.tanstackstart.server' },
          'tanstackstart.function.id': { type: 'string', value: expect.any(String) },
          'tanstackstart.function.filename': { type: 'string', value: 'src/routes/test-serverFn.tsx' },
        }),
      }),
    ]),
  );
});

test('Sends a server function span for a nested server function with manual span', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'tanstackstart-react-cloudflare',
    spans =>
      spans.some(isServerFnSegment) &&
      spans.some(span => span.name === 'GET /_serverFn/testNestedLog') &&
      spans.some(span => span.name === 'testNestedLog'),
  );

  await page.goto('/test-serverFn');

  await expect(page.locator('#server-fn-nested-btn')).toBeVisible();

  await page.locator('#server-fn-nested-btn').click();

  const spans = await spansPromise;

  const serverSegment = spans.find(isServerFnSegment);
  expect(serverSegment?.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.origin': { type: 'string', value: 'auto.http.cloudflare' },
  });

  expect(spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'GET /_serverFn/testNestedLog',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'function' },
          'sentry.origin': { type: 'string', value: 'auto.function.tanstackstart.server' },
          'tanstackstart.function.id': { type: 'string', value: expect.any(String) },
          'tanstackstart.function.filename': { type: 'string', value: 'src/routes/test-serverFn.tsx' },
        }),
      }),
      expect.objectContaining({
        name: 'testNestedLog',
        attributes: expect.objectContaining({
          'sentry.origin': { type: 'string', value: 'manual' },
        }),
      }),
    ]),
  );
});

test('Sends server-side span for page request', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('tanstackstart-react-cloudflare', span => {
    return span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/';
  });

  await fetch(`${baseURL}/`);

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.attributes).toMatchObject({
    'sentry.op': { type: 'string', value: 'http.server' },
    'sentry.origin': { type: 'string', value: 'auto.http.cloudflare' },
  });
  expect(serverSpan.status).toBe('ok');
});
