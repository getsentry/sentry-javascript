import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.describe('Astro actions', () => {
  test('captures a server span for the action page', async ({ page }) => {
    const spanPromise = waitForStreamedSpan('astro-5-cf-workers', span => {
      return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /action-test';
    });

    await page.goto('/action-test');

    const span = await spanPromise;

    expect(span.trace_id).toMatch(/^[a-f0-9]{32}$/);
    expect(span.span_id).toMatch(/^[a-f0-9]{16}$/);
  });

  test('captures a server span for an action submission', async ({ page }) => {
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

    await expect(page.locator('#result')).toContainText('success');

    const span = await spanPromise;
    expect(span.name).toBe('POST /_actions/[...path]');
    expect(span.trace_id).toMatch(/^[a-f0-9]{32}$/);
    expect(span.span_id).toMatch(/^[a-f0-9]{16}$/);
  });
});
