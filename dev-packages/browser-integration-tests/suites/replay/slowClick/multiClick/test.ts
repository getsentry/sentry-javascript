import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getCustomRecordingEvents,
  shouldSkipReplayTest,
  waitForReplayRequest,
  waitForReplayRequests,
} from '../../../../utils/replayHelpers';

sentryTest('captures multi click when not detecting slow click', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.multiClick');
    }),
    page.locator('#mutationButtonImmediately').click({ clickCount: 4 }),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.multiClick');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.multiClick',
      type: 'default',
      data: {
        clickCount: 4,
        metric: true,
        node: {
          attributes: {
            id: 'mutationButtonImmediately',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ***********',
        },
        nodeId: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButtonImmediately',
      timestamp: expect.any(Number),
    },
  ]);

  // When this has been flushed, the timeout has exceeded - so add a new click now, which should trigger another multi click

  const [req2] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.multiClick');
    }),
    page.locator('#mutationButtonImmediately').click({ clickCount: 3 }),
  ]);

  const { breadcrumbs: breadcrumbb2 } = getCustomRecordingEvents(req2);

  const slowClickBreadcrumbs2 = breadcrumbb2.filter(breadcrumb => breadcrumb.category === 'ui.multiClick');

  expect(slowClickBreadcrumbs2).toEqual([
    {
      category: 'ui.multiClick',
      type: 'default',
      data: {
        clickCount: 3,
        metric: true,
        node: {
          attributes: {
            id: 'mutationButtonImmediately',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ***********',
        },
        nodeId: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButtonImmediately',
      timestamp: expect.any(Number),
    },
  ]);
});

sentryTest('captures multiple multi clicks', async ({ getLocalTestUrl, page, forceFlushReplay, browserName }) => {
  if (shouldSkipReplayTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  let multiClickBreadcrumbCount = 0;

  const reqsPromise = waitForReplayRequests(page, (_event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);
    const count = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.multiClick').length;

    multiClickBreadcrumbCount += count;

    if (multiClickBreadcrumbCount === 2) {
      return true;
    }

    return false;
  });

  await page.locator('#mutationButtonImmediately').click({ clickCount: 4 });
  await forceFlushReplay();

  // Ensure we waited at least 1s, which is the threshold to create a new ui.click breadcrumb
  await new Promise(resolve => setTimeout(resolve, 1001));

  await page.locator('#mutationButtonImmediately').click({ clickCount: 2 });
  await forceFlushReplay();

  const responses = await reqsPromise;

  const slowClickBreadcrumbs = responses
    .flatMap(res => getCustomRecordingEvents(res).breadcrumbs)
    .filter(breadcrumb => breadcrumb.category === 'ui.multiClick');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.multiClick',
      type: 'default',
      data: {
        clickCount: 6,
        metric: true,
        node: {
          attributes: {
            id: 'mutationButtonImmediately',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ***********',
        },
        nodeId: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButtonImmediately',
      timestamp: expect.any(Number),
    },
    {
      category: 'ui.multiClick',
      type: 'default',
      data: {
        clickCount: 2,
        metric: true,
        node: {
          attributes: {
            id: 'mutationButtonImmediately',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ***********',
        },
        nodeId: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButtonImmediately',
      timestamp: expect.any(Number),
    },
  ]);
});
