import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('should create consistent parameterized span for default locale without prefix', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-15-intl', span => {
    return span.name === '/:locale/i18n-test' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/i18n-test`);

  const span = await spanPromise;

  expect(span.name).toBe('/:locale/i18n-test');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('should create consistent parameterized span for non-default locale with prefix', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-15-intl', span => {
    return span.name === '/:locale/i18n-test' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/ar/i18n-test`);

  const span = await spanPromise;

  expect(span.name).toBe('/:locale/i18n-test');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('should parameterize locale root page correctly for default locale without prefix', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-15-intl', span => {
    return span.name === '/:locale' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/`);

  const span = await spanPromise;

  expect(span.name).toBe('/:locale');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('should parameterize locale root page correctly for non-default locale with prefix', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('nextjs-15-intl', span => {
    return span.name === '/:locale' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto(`/fr`);

  const span = await spanPromise;

  expect(span.name).toBe('/:locale');
  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});
