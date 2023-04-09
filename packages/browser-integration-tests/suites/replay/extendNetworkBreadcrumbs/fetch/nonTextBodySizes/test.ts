import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  getCustomRecordingEvents,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../../utils/replayHelpers';

sentryTest('calculates body sizes for non-string bodies', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('**/foo', async route => {
    return route.fulfill({
      status: 200,
      body: Buffer.from('<html>Hello world</html>'),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
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
    const blob = new Blob(['<html>Hello world!!</html>'], { type: 'text/html' });

    fetch('http://localhost:7654/foo', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cache: 'no-cache',
      },
      body: blob,
    }).then(() => {
      // @ts-ignore Sentry is a global
      Sentry.captureException('test error');
    });
    /* eslint-enable */
  });

  const request = await requestPromise;
  const eventData = envelopeRequestParser(request);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData?.breadcrumbs?.length).toBe(1);
  expect(eventData!.breadcrumbs![0]).toEqual({
    timestamp: expect.any(Number),
    category: 'fetch',
    type: 'http',
    data: {
      method: 'POST',
      request_body_size: 26,
      response_body_size: 24,
      status_code: 200,
      url: 'http://localhost:7654/foo',
    },
  });

  const replayReq1 = await replayRequestPromise1;
  const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
  expect(performanceSpans1.filter(span => span.op === 'resource.fetch')).toEqual([
    {
      data: {
        method: 'POST',
        statusCode: 200,
        request: {
          size: 26,
        },
        response: {
          size: 24,
        },
      },
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});
