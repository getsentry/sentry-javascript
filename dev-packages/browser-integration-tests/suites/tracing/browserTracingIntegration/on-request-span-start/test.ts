import { SENTRY_OP } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('should call onRequestSpanStart hook', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site-fetch.example/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '',
    });
  });
  await page.route('http://sentry-test-site-xhr.example/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '',
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  await waitForStreamedSpanAndTraceHeaderOnUrl(page, url, span => getSpanOp(span) === 'pageload');
  await page.evaluate(() => (window as any).Sentry.flush());

  expect(spans).toContainEqual(
    expect.objectContaining({
      attributes: expect.objectContaining({
        [SENTRY_OP]: { type: 'string', value: 'http.client' },
        'hook.called.headers': { type: 'string', value: 'xhr' },
      }),
    }),
  );

  expect(spans).toContainEqual(
    expect.objectContaining({
      attributes: expect.objectContaining({
        [SENTRY_OP]: { type: 'string', value: 'http.client' },
        'hook.called.headers': { type: 'string', value: 'fetch' },
      }),
    }),
  );
});
