import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import { getCustomRecordingEvents, waitForReplayRequest } from '../../../../../utils/replayHelpers';

sentryTest(
  'captures response size from Content-Length header if available',
  async ({ getLocalTestPath, page, isReplayCapableBundle }) => {
    if (!isReplayCapableBundle()) {
      sentryTest.skip();
    }

    await page.route('**/foo', route => {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          userNames: ['John', 'Jane'],
        }),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '789',
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
      fetch('http://localhost:7654/foo').then(() => {
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
        method: 'GET',
        response_body_size: 789,
        status_code: 200,
        url: 'http://localhost:7654/foo',
      },
    });

    const replayReq1 = await replayRequestPromise1;
    const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
    expect(performanceSpans1.filter(span => span.op === 'resource.fetch')).toEqual([
      {
        data: {
          method: 'GET',
          statusCode: 200,
          response: {
            headers: {
              'content-length': '789',
              'content-type': 'application/json',
            },
            size: 789,
          },
        },
        description: 'http://localhost:7654/foo',
        endTimestamp: expect.any(Number),
        op: 'resource.fetch',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);

sentryTest(
  'captures response size without Content-Length header',
  async ({ getLocalTestPath, page, isReplayCapableBundle }) => {
    if (!isReplayCapableBundle()) {
      sentryTest.skip();
    }

    await page.route('**/foo', route => {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          userNames: ['John', 'Jane'],
        }),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '',
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
      fetch('http://localhost:7654/foo').then(() => {
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
        method: 'GET',
        status_code: 200,
        // NOT set here from body, as this would be async
        url: 'http://localhost:7654/foo',
      },
    });

    const replayReq1 = await replayRequestPromise1;
    const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
    expect(performanceSpans1.filter(span => span.op === 'resource.fetch')).toEqual([
      {
        data: {
          method: 'GET',
          statusCode: 200,
          response: {
            headers: {
              'content-type': 'application/json',
            },
            size: 29,
          },
        },
        description: 'http://localhost:7654/foo',
        endTimestamp: expect.any(Number),
        op: 'resource.fetch',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);

sentryTest(
  'captures response size from non-text response body',
  async ({ getLocalTestPath, page, browserName, isReplayCapableBundle }) => {
    if (!isReplayCapableBundle()) {
      sentryTest.skip();
    }

    const additionalHeaders = browserName === 'webkit' ? { 'content-type': 'application/octet-stream' } : {};

    await page.route('**/foo', async route => {
      return route.fulfill({
        status: 200,
        body: Buffer.from('<html>Hello world</html>'),
        headers: {
          'Content-Length': '',
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
      fetch('http://localhost:7654/foo', {
        method: 'POST',
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
          response: {
            size: 24,
            headers: {
              ...additionalHeaders,
            },
          },
        },
        description: 'http://localhost:7654/foo',
        endTimestamp: expect.any(Number),
        op: 'resource.fetch',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);
