import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('window.open() is considered for slow click', async ({ getLocalTestUrl, page, browser }) => {
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

  // Ensure window.open() still works as expected
  const context = browser.contexts()[0];
  const waitForNewPage = context.waitForEvent('page');

  await page.click('#windowOpenButton');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            id: 'windowOpenButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '****** ****',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > button#windowOpenButton',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);

  await waitForNewPage;

  const pages = context.pages();

  expect(pages.length).toBe(2);
  expect(pages[1].url()).toBe('https://example.com/');
});
