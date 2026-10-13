import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

for (const locale of ['en', 'ar']) {
  test(`should create consistent parameterized span for i18n routes - locale: ${locale}`, async ({ page }) => {
    const spanPromise = waitForStreamedSpan('nextjs-15', span => {
      return span.name === '/:locale/i18n-test' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/${locale}/i18n-test`);

    const span = await spanPromise;

    expect(span.name).toBe('/:locale/i18n-test');
    expect(span.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.nextjs.app_router_instrumentation', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    });
  });
}
