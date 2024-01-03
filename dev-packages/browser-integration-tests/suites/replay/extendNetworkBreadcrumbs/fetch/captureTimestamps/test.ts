import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  getCustomRecordingEvents,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../../utils/replayHelpers';

sentryTest('captures correct timestamps', async ({ getLocalTestPath, page, browserName }) => {
  // These are a bit flaky on non-chromium browsers
  if (shouldSkipReplayTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', async route => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const requestPromise = waitForErrorRequest(page);
  const replayRequestPromise1 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await page.evaluate(() => {
    /* eslint-disable */
    fetch('http://localhost:7654/foo', {
      method: 'POST',
      body: '{"foo":"bar"}',
    }).then(() => {
      // @ts-expect-error Sentry is a global
      Sentry.captureException('test error');
    });
    /* eslint-enable */
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  const replayReq1 = await replayRequestPromise1;
  const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);

  const xhrSpan = performanceSpans1.find(span => span.op === 'resource.fetch')!;

  expect(xhrSpan).toBeDefined();

  const { startTimestamp, endTimestamp } = xhrSpan;

  expect(startTimestamp).toEqual(expect.any(Number));
  expect(endTimestamp).toEqual(expect.any(Number));
  expect(endTimestamp).toBeGreaterThan(startTimestamp);

  expect(eventData!.breadcrumbs![0].timestamp).toBeGreaterThan(startTimestamp);
});
