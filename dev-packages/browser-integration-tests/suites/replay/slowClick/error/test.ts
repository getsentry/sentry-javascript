import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getCustomRecordingEvents,
  getReplayEventFromRequest,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../utils/replayHelpers';

sentryTest('slow click that triggers error is captured', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const [req0] = await Promise.all([
    waitForReplayRequest(page, (_event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
    }),
    page.locator('#buttonError').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req0);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.slowClickDetected',
      type: 'default',
      data: {
        endReason: 'timeout',
        clickCount: 1,
        node: {
          attributes: {
            id: 'buttonError',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* *****',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: 3500,
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#buttonError',
      timestamp: expect.any(Number),
    },
  ]);
});

sentryTest(
  'click that triggers error & mutation is not captured',
  async ({ getLocalTestUrl, page, forceFlushReplay }) => {
    if (shouldSkipReplayTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    let slowClickCount = 0;

    page.on('response', res => {
      const req = res.request();

      const event = getReplayEventFromRequest(req);

      if (!event) {
        return;
      }

      const { breadcrumbs } = getCustomRecordingEvents(res);

      const slowClicks = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
      slowClickCount += slowClicks.length;
    });

    const [req1] = await Promise.all([
      waitForReplayRequest(page, (_event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
      }),
      page.locator('#buttonErrorMutation').click(),
    ]);

    const { breadcrumbs } = getCustomRecordingEvents(req1);

    expect(breadcrumbs).toEqual([
      {
        category: 'ui.click',
        data: {
          node: {
            attributes: {
              id: 'buttonErrorMutation',
            },
            id: expect.any(Number),
            tagName: 'button',
            textContent: '******* *****',
          },
          nodeId: expect.any(Number),
        },
        message: 'body > button#buttonErrorMutation',
        timestamp: expect.any(Number),
        type: 'default',
      },
    ]);

    // Ensure we wait for timeout, to make sure no slow click is created
    // Waiting for 3500 + 1s rounding room
    await new Promise(resolve => setTimeout(resolve, 4500));
    await forceFlushReplay();

    expect(slowClickCount).toBe(0);
  },
);
