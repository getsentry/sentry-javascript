import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest } from '../../../utils/fixtures';

sentryTest('adds X-Sentry-User-Agent header to envelope requests', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const requestHeadersPromise = new Promise<Record<string, string>>(resolve => {
    page.route('https://dsn.ingest.sentry.io/**/*', (route, request) => {
      resolve(request.headers());
      return route.fulfill({
        status: 200,
        body: JSON.stringify({}),
      });
    });
  });

  await page.goto(url);

  const requestHeaders = await requestHeadersPromise;

  expect(requestHeaders).toMatchObject({
    // this is the browser's user-agent header (which we don't modify)
    'user-agent': expect.any(String),

    // this is the SDK's user-agent header (in browser)
    'x-sentry-user-agent': `sentry.javascript.browser/${SDK_VERSION}`,

    // this is a custom header users add via `transportOptions.headers`
    'x-custom-header': 'custom-value',
  });
});
