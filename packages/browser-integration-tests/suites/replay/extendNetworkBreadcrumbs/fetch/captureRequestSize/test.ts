import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import { getCustomRecordingEvents, waitForReplayRequest } from '../../../../../utils/replayHelpers';

sentryTest(
  'captures request body size when body is sent',
  async ({ getLocalTestPath, page, browserName, isReplayCapableBundle }) => {
    if (!isReplayCapableBundle()) {
      sentryTest.skip();
    }

    const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

    await page.route('**/foo', route => {
      return route.fulfill({
        status: 200,
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
      fetch('http://localhost:7654/foo', {
        method: 'POST',
        body: '{"foo":"bar"}',
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
        request_body_size: 13,
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
            size: 13,
            headers: {},
          },
          response: additionalHeaders ? { headers: additionalHeaders } : undefined,
        },
        description: 'http://localhost:7654/foo',
        endTimestamp: expect.any(Number),
        op: 'resource.fetch',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);

sentryTest('captures request size from non-text request body', async ({ getLocalTestPath, page, browserName, isReplayCapableBundle }) => {
  if (!isReplayCapableBundle()) {
    sentryTest.skip();
  }

  const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'text/plain' } : undefined;

  await page.route('**/foo', async route => {
    return route.fulfill({
      status: 200,
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
          headers: {},
        },
        response: additionalHeaders ? { headers: additionalHeaders } : undefined,
      },
      description: 'http://localhost:7654/foo',
      endTimestamp: expect.any(Number),
      op: 'resource.fetch',
      startTimestamp: expect.any(Number),
    },
  ]);
});
