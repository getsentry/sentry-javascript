import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('low-quality span filter', () => {
  test('does not send a server span for /__manifest? requests', async ({ page }) => {
    const streamedSpans: SerializedStreamedSpan[] = [];

    const navigationPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/ssr' && getSpanOp(span) === 'navigation' && span.is_segment;
    });

    waitForStreamedSpans(APP_NAME, spans => {
      streamedSpans.push(...spans);
      return false;
    });

    await page.goto('/performance');
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'SSR Page' }).click();

    await navigationPromise;

    // Force the server to flush any in-flight spans before we assert
    await page.evaluate(() => fetch('/__sentry-flush'));

    const targetIsManifest = (span: SerializedStreamedSpan) => {
      const urlPath = span.attributes['url.path']?.value;
      return typeof urlPath === 'string' && urlPath.includes('/__manifest');
    };
    expect(streamedSpans.some(targetIsManifest)).toBe(false);
  });
});
