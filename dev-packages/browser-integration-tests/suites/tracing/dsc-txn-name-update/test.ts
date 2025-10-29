import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { DynamicSamplingContext } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../utils/helpers';

sentryTest('updates the DSC when the txn name is updated and high-quality', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('http://sentry-test-site.example/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(url);

  /*
  Test Steps:
  1. Start new span with LQ txn name (source: url)
  2. Make request and check that baggage has no transaction name
  3. Capture error and check that envelope trace header has no transaction name
  4. Update span name and source to HQ (source: route)
  5. Make request and check that baggage has HQ txn name
  6. Capture error and check that envelope trace header has HQ txn name
  7. Update span name again with HQ name (source: route)
  8. Make request and check that baggage has updated HQ txn name
  9. Capture error and check that envelope trace header has updated HQ txn name
  10. End span and check that envelope trace header has updated HQ txn name
  11. Make another request and check that there's no span information in baggage
  12. Capture an error and check that envelope trace header has no span information
  */

  // 1
  await page.locator('#btnStartSpan').click();
  const traceId = await page.evaluate(() => {
    return (window as any).__traceId;
  });

  expect(traceId).toMatch(/^[\da-f]{32}$/);

  // 2
  const baggageItems = await makeRequestAndGetBaggageItems(page);
  expect(baggageItems).toEqual([
    'sentry-environment=production',
    'sentry-public_key=public',
    'sentry-release=1.1.1',
    expect.stringMatching(/sentry-sample_rand=0\.\d+/),
    'sentry-sample_rate=1',
    'sentry-sampled=true',
    `sentry-trace_id=${traceId}`,
  ]);

  // 3
  const errorEnvelopeTraceHeader = await captureErrorAndGetEnvelopeTraceHeader(page);
  expect(errorEnvelopeTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    release: '1.1.1',
    sample_rate: '1',
    sampled: 'true',
    trace_id: traceId,
    sample_rand: expect.any(String),
  });

  // 4
  await page.locator('#btnUpdateName').click();

  // 5
  const baggageItemsAfterUpdate = await makeRequestAndGetBaggageItems(page);
  expect(baggageItemsAfterUpdate).toEqual([
    'sentry-environment=production',
    'sentry-public_key=public',
    'sentry-release=1.1.1',
    expect.stringMatching(/sentry-sample_rand=0\.\d+/),
    'sentry-sample_rate=1',
    'sentry-sampled=true',
    `sentry-trace_id=${traceId}`,
    'sentry-transaction=updated-root-span-1',
  ]);

  // 6
  const errorEnvelopeTraceHeaderAfterUpdate = await captureErrorAndGetEnvelopeTraceHeader(page);
  expect(errorEnvelopeTraceHeaderAfterUpdate).toEqual({
    environment: 'production',
    public_key: 'public',
    release: '1.1.1',
    sample_rate: '1',
    sampled: 'true',
    trace_id: traceId,
    transaction: 'updated-root-span-1',
    sample_rand: expect.any(String),
  });

  // 7
  await page.locator('#btnUpdateName').click();

  // 8
  const baggageItemsAfterSecondUpdate = await makeRequestAndGetBaggageItems(page);
  expect(baggageItemsAfterSecondUpdate).toEqual([
    'sentry-environment=production',
    'sentry-public_key=public',
    'sentry-release=1.1.1',
    expect.stringMatching(/sentry-sample_rand=0\.\d+/),
    'sentry-sample_rate=1',
    'sentry-sampled=true',
    `sentry-trace_id=${traceId}`,
    'sentry-transaction=updated-root-span-2',
  ]);

  // 9
  const errorEnvelopeTraceHeaderAfterSecondUpdate = await captureErrorAndGetEnvelopeTraceHeader(page);
  expect(errorEnvelopeTraceHeaderAfterSecondUpdate).toEqual({
    environment: 'production',
    public_key: 'public',
    release: '1.1.1',
    sample_rate: '1',
    sampled: 'true',
    trace_id: traceId,
    transaction: 'updated-root-span-2',
    sample_rand: expect.any(String),
  });

  // 10
  const txnEventPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
    page,
    1,
    { envelopeType: 'transaction' },
    eventAndTraceHeaderRequestParser,
  );

  await page.locator('#btnEndSpan').click();

  const [txnEvent, txnEnvelopeTraceHeader] = (await txnEventPromise)[0];
  expect(txnEnvelopeTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    release: '1.1.1',
    sample_rate: '1',
    sampled: 'true',
    trace_id: traceId,
    transaction: 'updated-root-span-2',
    sample_rand: expect.any(String),
  });

  expect(txnEvent.transaction).toEqual('updated-root-span-2');

  // 11
  const baggageItemsAfterEnd = await makeRequestAndGetBaggageItems(page);
  expect(baggageItemsAfterEnd).toEqual([
    'sentry-environment=production',
    'sentry-public_key=public',
    'sentry-release=1.1.1',
    `sentry-trace_id=${traceId}`,
  ]);

  // 12
  const errorEnvelopeTraceHeaderAfterEnd = await captureErrorAndGetEnvelopeTraceHeader(page);
  expect(errorEnvelopeTraceHeaderAfterEnd).toEqual({
    environment: 'production',
    public_key: 'public',
    release: '1.1.1',
    trace_id: traceId,
  });
});

async function makeRequestAndGetBaggageItems(page: Page): Promise<string[]> {
  const requestPromise = page.waitForRequest('https://sentry-test-site.example/*');
  await page.locator('#btnMakeRequest').click();
  const request = await requestPromise;

  const baggage = await request.headerValue('baggage');

  return baggage?.split(',').sort() ?? [];
}

async function captureErrorAndGetEnvelopeTraceHeader(page: Page): Promise<Partial<DynamicSamplingContext> | undefined> {
  const errorEventPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
    page,
    1,
    { envelopeType: 'event' },
    eventAndTraceHeaderRequestParser,
  );

  await page.locator('#btnCaptureError').click();

  const [, errorEnvelopeTraceHeader] = (await errorEventPromise)[0];

  return errorEnvelopeTraceHeader;
}
