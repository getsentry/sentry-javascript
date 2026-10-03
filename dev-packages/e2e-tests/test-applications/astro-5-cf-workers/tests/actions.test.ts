import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.describe('Astro actions', () => {
  test('captures span for action call', async ({ page }) => {
    const spanPromise = waitForStreamedSpan('astro-5-cf-workers', span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /action-test';
    });

    await page.goto('/action-test');

    const span = await spanPromise;

    expect(span).toMatchObject({
      name: 'GET /action-test',
    });

    const traceId = span.trace_id;
    expect(traceId).toMatch(/[a-f0-9]{32}/);
  });

  test('action submission creates a span', async ({ page }) => {
    await page.goto('/action-test');

    const spanPromise = waitForStreamedSpan('astro-5-cf-workers', span => {
      return (
        getSpanOp(span) === 'http.server' &&
        span.is_segment &&
        span.attributes['http.request.method']?.value === 'POST' &&
        span.attributes['url.path']?.value === '/_actions/testAction/'
      );
    });

    await page.getByText('Submit Action').click();

    // Wait for the result to appear on the page
    await page.waitForSelector('#result:not(:empty)');

    const resultText = await page.locator('#result').textContent();
    expect(resultText).toContain('success');

    const span = await spanPromise;
    expect(span).toBeDefined();
    expect(span.trace_id).toMatch(/[a-f0-9]{32}/);
  });
});
