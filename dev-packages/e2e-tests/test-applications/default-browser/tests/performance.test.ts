import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('captures a pageload span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('default-browser', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);

  const span = await spanPromise;

  expect(span.name).toBe('Pageload');
  expect(span.status).toBe('ok');
  expect(span.span_id).toMatch(/[a-f0-9]{16}/);
  expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(span.attributes).toMatchObject({
    'sentry.idle_span_finish_reason': { value: 'idleTimeout', type: 'string' },
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.browser', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'url', type: 'string' },
    'url.full': { value: 'http://localhost:3030/', type: 'string' },
    'url.path': { value: '/', type: 'string' },
  });
});

test('captures a navigation span', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const pageloadSpanPromise = waitForStreamedSpan('default-browser', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment;
  });

  const navigationSpanPromise = waitForStreamedSpan('default-browser', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const linkElement = page.locator('id=navigation-link');

  await linkElement.click();

  const navigationSpan = await navigationSpanPromise;

  expect(navigationSpan.name).toBe('Navigation');
  expect(navigationSpan.status).toBe('ok');
  expect(navigationSpan.span_id).toMatch(/[a-f0-9]{16}/);
  expect(navigationSpan.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(navigationSpan.attributes).toMatchObject({
    'sentry.op': { value: 'navigation', type: 'string' },
    'sentry.origin': { value: 'auto.navigation.browser', type: 'string' },
    'sentry.segment.name.source': { value: 'url', type: 'string' },
    'url.full': { value: 'http://localhost:3030/#navigation-target', type: 'string' },
    'url.path': { value: '/', type: 'string' },
  });
});
