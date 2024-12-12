import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('mutation after timeout results in slow click', async ({ getLocalTestUrl, page }) => {
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
    page.locator('#mutationButtonLate').click(),
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
            id: 'mutationButtonLate',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ****',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: 3500,
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButtonLate',
      timestamp: expect.any(Number),
    },
  ]);
});

sentryTest('console.log results in slow click', async ({ getLocalTestUrl, page }) => {
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

    page.locator('#consoleLogButton').click(),
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
            id: 'consoleLogButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******* ***',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: 3500,
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#consoleLogButton',
      timestamp: expect.any(Number),
    },
  ]);
});
