import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('immediate scroll does not trigger slow click', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
    }),
    page.locator('#scrollButton').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            id: 'scrollButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > button#scrollButton',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);
});

sentryTest('late scroll triggers slow click', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
    }),
    page.locator('#scrollLateButton').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

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
            id: 'scrollLateButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ****** ****',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#scrollLateButton',
      timestamp: expect.any(Number),
    },
  ]);
});
