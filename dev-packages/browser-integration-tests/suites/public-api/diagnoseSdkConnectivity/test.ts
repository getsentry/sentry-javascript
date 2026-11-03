import type { SerializedStreamedSpan, StreamedSpanEnvelope } from '@sentry/core';
import { expect } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  getEnvelopeType,
  properFullEnvelopeParser,
  shouldSkipTracingTest,
  waitForErrorRequest,
} from '../../../utils/helpers';

sentryTest('makes a call to sentry.io to diagnose SDK connectivity', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;
  if (shouldSkipTracingTest() || !!bundle) {
    // the CDN bundle doesn't export diagnoseSdkConnectivity. So skipping the test for bundles.
    sentryTest.skip();
  }

  const spans: SerializedStreamedSpan[] = [];
  page.on('request', request => {
    if (!request.url().startsWith('https://dsn.ingest.sentry.io/')) {
      return;
    }
    if (getEnvelopeType(request) === 'span') {
      spans.push(...properFullEnvelopeParser<StreamedSpanEnvelope>(request)[1][0][1].items);
    }
  });
  const pageloadSpanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

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

  await pageloadSpanPromise;

  // undefined is expected and means the request was successful
  expect(await diagnoseMessagePromise).toEqual('SDK connectivity: undefined');

  // the request to sentry.io should not be traced, hence no http.client span should be sent.
  await page.evaluate(() => (window as any).Sentry.flush());
  const httpClientSpans = spans.filter(span => getSpanOp(span) === 'http.client');
  expect(httpClientSpans).toHaveLength(0);

  // no fetch breadcrumb should be sent (only breadcrumb for the console log)
  const eventPromise = waitForErrorRequest(page, event => event.message === 'connectivity checked');
  await page.evaluate(() => (window as any).Sentry.captureMessage('connectivity checked'));
  const event = envelopeRequestParser(await eventPromise);
  expect(event.breadcrumbs).toEqual([
    expect.objectContaining({
      category: 'console',
      message: 'SDK connectivity: undefined',
    }),
  ]);
});
