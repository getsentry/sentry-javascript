import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../utils/helpers';

sentryTest('makes a call to sentry.io to diagnose SDK connectivity', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;
  if (shouldSkipTracingTest() || !!bundle) {
    // the CDN bundle doesn't export diagnoseSdkConnectivity. So skipping the test for bundles.
    sentryTest.skip();
  }

  const pageloadRequestPromise = waitForTransactionRequest(page, e => e.contexts?.trace?.op === 'pageload');

  // mock sdk connectivity url to avoid making actual request to sentry.io
  page.route('**/api/4509632503087104/envelope/**/*', route => {
    return route.fulfill({
      status: 200,
      body: '{}',
    });
  });

  const diagnoseMessagePromise = new Promise<string>(resolve => {
    page.on('console', msg => {
      if (msg.text().includes('SDK connectivity:')) {
        resolve(msg.text());
      }
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageLoadEvent = envelopeRequestParser(await pageloadRequestPromise);

  // undefined is expected and means the request was successful
  expect(await diagnoseMessagePromise).toEqual('SDK connectivity: undefined');

  // the request to sentry.io should not be traced, hence no http.client span should be sent.
  const httpClientSpans = pageLoadEvent.spans?.filter(s => s.op === 'http.client');
  expect(httpClientSpans).toHaveLength(0);

  // no fetch breadcrumb should be sent (only breadcrumb for the console log)
  expect(pageLoadEvent.breadcrumbs).toEqual([
    expect.objectContaining({
      category: 'console',
      message: 'SDK connectivity: undefined',
    }),
  ]);
});
