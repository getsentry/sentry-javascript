import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('sends a server action span on pageload', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'solidstart-dynamic-import',
    spans =>
      spans.some(
        span =>
          span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/users/6',
      ) && spans.some(span => span.name === 'getPrefecture'),
  );

  await page.goto('/users/6');

  const spans = await spansPromise;
  const functionSpan = spans.find(span => span.name === 'getPrefecture');

  expect(functionSpan).toBeDefined();
  expect(functionSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'function', type: 'string' },
    'sentry.origin': { value: 'auto.function.solidstart', type: 'string' },
  });
});

test('sends a server action span on client navigation', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'solidstart-dynamic-import',
    spans =>
      spans.some(span => span.is_segment && span.name === 'POST getPrefecture') &&
      spans.some(span => span.name === 'getPrefecture' && !span.is_segment),
  );

  await page.goto('/');
  await page.locator('#navLink').click();
  await page.waitForURL('/users/5');

  const spans = await spansPromise;
  const functionSpan = spans.find(span => span.name === 'getPrefecture' && !span.is_segment);

  expect(functionSpan).toBeDefined();
  expect(functionSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'function', type: 'string' },
    'sentry.origin': { value: 'auto.function.solidstart', type: 'string' },
  });
});
