import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('does not capture slow click when slowClickTimeout === 0', async ({ getLocalTestUrl, page }) => {
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
    page.locator('#mutationButton').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            id: 'mutationButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ********',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > button#mutationButton',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);
});
