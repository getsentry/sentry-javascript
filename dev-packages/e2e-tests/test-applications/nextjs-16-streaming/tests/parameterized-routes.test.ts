import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';

test('should create a parameterized streamed span when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/:one' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/:one');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes?.['sentry.source']?.value).toBe('route');
});

test('should create a static streamed span when the `app` directory is used and the route is not parameterized', async ({
  page,
}) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/static' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/static`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/static');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes?.['sentry.source']?.value).toBe('url');
});

test('should create a partially parameterized streamed span when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/:one/beep' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino/beep`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/:one/beep');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes?.['sentry.source']?.value).toBe('route');
});

test('should create a nested parameterized streamed span when the `app` directory is used.', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/:one/beep/:two' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino/beep/espresso`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/:one/beep/:two');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes?.['sentry.source']?.value).toBe('route');
});
