import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('click is ignored on ignoreSelectors', async ({ getLocalTestUrl, page }) => {
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
    page.locator('#mutationIgnoreButton').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            class: 'ignore-class',
            id: 'mutationIgnoreButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ****** ****',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > button#mutationIgnoreButton.ignore-class',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);
});

sentryTest('click is ignored on div', async ({ getLocalTestUrl, page }) => {
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

    await page.locator('#mutationDiv').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            id: 'mutationDiv',
          },
          id: expect.any(Number),
          tagName: 'div',
          textContent: '******* ********',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > div#mutationDiv',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);
});
