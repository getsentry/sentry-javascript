import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('does not capture slow click when slowClickTimeout === 0', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });

  await page.click('#mutationButton');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

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
