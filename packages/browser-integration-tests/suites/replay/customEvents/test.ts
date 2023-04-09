import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  expectedClickBreadcrumb,
  expectedFCPPerformanceSpan,
  expectedFPPerformanceSpan,
  expectedLCPPerformanceSpan,
  expectedMemoryPerformanceSpan,
  expectedNavigationPerformanceSpan,
  getExpectedReplayEvent,
} from '../../../utils/replayEventTemplates';
import type { PerformanceSpan } from '../../../utils/replayHelpers';
import {
  getCustomRecordingEvents,
  getReplayEvent,
  getReplayRecordingContent,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

sentryTest(
  'replay recording should contain default performance spans',
  async ({ getLocalTestPath, page, browserName }) => {
    // We only test this against the NPM package and replay bundles
    // and only on chromium as most performance entries are only available in chromium
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    const replayEvent0 = getReplayEvent(await reqPromise0);
    const { performanceSpans: performanceSpans0 } = getCustomRecordingEvents(await reqPromise0);

    expect(replayEvent0).toEqual(getExpectedReplayEvent({ segment_id: 0 }));

    await page.click('button');

    const replayEvent1 = getReplayEvent(await reqPromise1);
    const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(await reqPromise1);

    expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

    // We can't guarantee the order of the performance spans, or in which of the two segments they are sent
    // So to avoid flakes, we collect them all and check that they are all there
    const collectedPerformanceSpans = [...performanceSpans0, ...performanceSpans1];

    expect(collectedPerformanceSpans).toEqual(
      expect.arrayContaining([
        expectedNavigationPerformanceSpan,
        expectedLCPPerformanceSpan,
        expectedFPPerformanceSpan,
        expectedFCPPerformanceSpan,
        expectedMemoryPerformanceSpan, // two memory spans - once per flush
        expectedMemoryPerformanceSpan,
      ]),
    );

    const lcpSpan = collectedPerformanceSpans.find(
      s => s.description === 'largest-contentful-paint',
    ) as PerformanceSpan;

    // LCP spans should be point-in-time spans
    expect(lcpSpan?.startTimestamp).toBeCloseTo(lcpSpan?.endTimestamp);
  },
);

sentryTest(
  'replay recording should contain a click breadcrumb when a button is clicked',
  async ({ forceFlushReplay, getLocalTestPath, page, browserName }) => {
    // TODO(replay): This is flakey on firefox and webkit where clicks are flakey
    if (shouldSkipReplayTest() || ['firefox', 'webkit'].includes(browserName)) {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await reqPromise0;

    await page.click('#error');
    await page.click('#img');
    await page.click('.sentry-unmask');
    await forceFlushReplay();
    const req1 = await reqPromise1;
    const content1 = getReplayRecordingContent(req1);
    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > div#error.btn.btn-error[aria-label="An Error"]',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                'aria-label': '** *****',
                class: 'btn btn-error',
                id: 'error',
                role: 'button',
              },
              id: expect.any(Number),
              tagName: 'div',
              textContent: '** *****',
            },
          },
        },
      ]),
    );

    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button > img#img[alt="Alt Text"]',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                alt: 'Alt Text',
                id: 'img',
              },
              id: expect.any(Number),
              tagName: 'img',
              textContent: '',
            },
          },
        },
      ]),
    );

    expect(content1.breadcrumbs).toEqual(
      expect.arrayContaining([
        {
          ...expectedClickBreadcrumb,
          message: 'body > button.sentry-unmask[aria-label="Unmasked label"]',
          data: {
            nodeId: expect.any(Number),
            node: {
              attributes: {
                'aria-label': 'Unmasked label',
                class: 'sentry-unmask',
              },
              id: expect.any(Number),
              tagName: 'button',
              textContent: 'Unmasked',
            },
          },
        },
      ]),
    );
  },
);
