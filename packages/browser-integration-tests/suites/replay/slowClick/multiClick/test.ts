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

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.multiClick');
  });

  await page.click('#mutationButtonImmediately', { clickCount: 4 });

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

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
});

sentryTest('captures multiple multi clicks', async ({ getLocalTestUrl, page, forceFlushReplay, browserName }) => {
  // This test seems to only be flakey on firefox and webkit
  if (shouldSkipReplayTest() || ['firefox', 'webkit'].includes(browserName)) {
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

  await page.click('#mutationButtonImmediately', { clickCount: 4 });
  await forceFlushReplay();

  // Ensure we waited at least 1s, which is the threshold to create a new ui.click breadcrumb
  await new Promise(resolve => setTimeout(resolve, 1001));

  await page.click('#mutationButtonImmediately', { clickCount: 2 });
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
