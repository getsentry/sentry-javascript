import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('sends a pageload span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-vite', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  await page.goto(`/`);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan).toMatchObject({
    name: 'route:index',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.ember' },
    },
  });
});

test('sends a navigation span with a parameterized URL', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-vite', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('ember-vite', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);
  await pageloadSpanPromise;

  const [_, navigationSpan] = await Promise.all([page.getByText('Tracing').click(), navigationSpanPromise]);

  expect(navigationSpan).toMatchObject({
    name: 'route:tracing',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.ember' },
    },
  });
});

test('sends a navigation span even if the pageload span is still active', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('ember-vite', span => {
    return span.is_segment && getSpanOp(span) === 'pageload';
  });

  const navigationSpanPromise = waitForStreamedSpan('ember-vite', span => {
    return span.is_segment && getSpanOp(span) === 'navigation';
  });

  await page.goto(`/`);

  // immediately navigate to a different route
  const [_, pageloadSpan, navigationSpan] = await Promise.all([
    page.getByText('Tracing').click(),
    pageloadSpanPromise,
    navigationSpanPromise,
  ]);

  expect(pageloadSpan).toMatchObject({
    name: 'route:index',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'pageload' },
      'sentry.origin': { type: 'string', value: 'auto.pageload.ember' },
    },
  });

  expect(navigationSpan).toMatchObject({
    name: 'route:tracing',
    is_segment: true,
    attributes: {
      'sentry.op': { type: 'string', value: 'navigation' },
      'sentry.origin': { type: 'string', value: 'auto.navigation.ember' },
    },
  });
});
