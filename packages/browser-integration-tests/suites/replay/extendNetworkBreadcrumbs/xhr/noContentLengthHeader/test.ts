import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import { shouldSkipReplayTest } from '../../../../../utils/replayHelpers';

sentryTest(
  'captures response_body_size without Content-Length header',
  async ({ getLocalTestPath, page, browserName }) => {
    // These are a bit flaky on non-chromium browsers
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
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

    const requestPromise = waitForErrorRequest(page);
    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    await page.evaluate(() => {
      /* eslint-disable */
      const xhr = new XMLHttpRequest();

      xhr.open('GET', 'http://localhost:7654/foo');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Cache', 'no-cache');
      xhr.send();

      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState === 4) {
          // @ts-ignore Sentry is a global
          setTimeout(() => Sentry.captureException('test error', 0));
        }
      });
      /* eslint-enable */
    });

    const request = await requestPromise;
    const eventData = envelopeRequestParser(request);

    expect(eventData.exception?.values).toHaveLength(1);

    expect(eventData?.breadcrumbs?.length).toBe(1);
    expect(eventData!.breadcrumbs![0]).toEqual({
      timestamp: expect.any(Number),
      category: 'xhr',
      type: 'http',
      data: {
        method: 'GET',
        response_body_size: 29,
        status_code: 200,
        url: 'http://localhost:7654/foo',
      },
    });
  },
);
