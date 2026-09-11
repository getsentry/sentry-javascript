import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('should create a parameterized pageload span when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === '/parameterized/:one' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino`);

  const span = await spanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.environment': { value: 'qa', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
  });
});

test('should create a span named after the static route when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === '/parameterized/static' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/static`);

  const span = await spanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.environment': { value: 'qa', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
    'url.template': { value: '/parameterized/static', type: 'string' },
  });
});

test('should create a partially parameterized pageload span when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === '/parameterized/:one/beep' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino/beep`);

  const span = await spanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.environment': { value: 'qa', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
  });
});

test('should create a nested parameterized pageload span when the `app` directory is used', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-16-cf-workers', span => {
    return span.name === '/parameterized/:one/beep/:two' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/parameterized/cappuccino/beep/espresso`);

  const span = await spanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.environment': { value: 'qa', type: 'string' },
    'react.version': { value: expect.any(String), type: 'string' },
  });
});
