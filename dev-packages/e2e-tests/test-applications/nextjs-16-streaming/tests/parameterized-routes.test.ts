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
  expect(span.attributes['sentry.source']?.value).toBe('route');
});

test('should create a streamed span named after the static route when the `app` directory is used', async ({
  page,
}) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/static' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/static`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/static');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes).toMatchObject({
    ['sentry.segment.name.source']: { value: 'route', type: 'string' },
    ['url.template']: { value: '/parameterized/static', type: 'string' },
    ['url.path']: { value: '/parameterized/static', type: 'string' },
  });
});

test('should fall back to a low cardinality span name for routes the manifest does not know', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === 'Pageload' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/this-route-does-not-exist');

  const span = await spanPromise;

  expect(span.name).toBe('Pageload');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes).toMatchObject({
    ['sentry.segment.name.source']: { value: 'url', type: 'string' },
    ['url.path']: { value: '/this-route-does-not-exist', type: 'string' },
  });
});

test('should create a partially parameterized streamed span when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/:one/beep' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino/beep`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/:one/beep');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes['sentry.source']?.value).toBe('route');
});

test('should create a nested parameterized streamed span when the `app` directory is used.', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-streaming', span => {
    return span.name === '/parameterized/:one/beep/:two' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino/beep/espresso`);

  const span = await spanPromise;

  expect(span.name).toBe('/parameterized/:one/beep/:two');
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes['sentry.source']?.value).toBe('route');
});
