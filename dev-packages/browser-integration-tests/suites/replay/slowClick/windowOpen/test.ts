import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('window.open() is considered for slow click', async ({ getLocalTestUrl, page, browser }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('http://example.com/', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });

  // Ensure window.open() still works as expected
  const context = browser.contexts()[0];

  const [reqResponse1] = await Promise.all([
    reqPromise1,
    context.waitForEvent('page'),
    page.locator('#windowOpenButton').click(),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(reqResponse1);

  // Filter out potential blur breadcrumb, as otherwise this can be flaky
  const filteredBreadcrumb = breadcrumbs.filter(breadcrumb => breadcrumb.category !== 'ui.blur');

  expect(filteredBreadcrumb).toEqual([
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

  const pages = context.pages();

  expect(pages.length).toBe(2);
  expect(pages[1].url()).toBe('https://example.com/');
});
