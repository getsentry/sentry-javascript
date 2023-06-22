import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

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

sentryTest('captures multiple multi clicks', async ({ getLocalTestUrl, page, forceFlushReplay }) => {
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

  let lastMultiClickSegmentId: number | undefined;

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    const check = !lastMultiClickSegmentId && breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.multiClick');
    if (check) {
      lastMultiClickSegmentId = event.segment_id;
    }
    return check;
  });

  const reqPromise2 = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    const check =
      !!lastMultiClickSegmentId &&
      event.segment_id > lastMultiClickSegmentId &&
      breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.multiClick');
    if (check) {
      lastMultiClickSegmentId = event.segment_id;
    }
    return check;
  });

  const time = Date.now();

  await page.click('#mutationButtonImmediately', { clickCount: 4 });

  // Ensure we waited at least 1s, which is the threshold to create a new ui.click breadcrumb
  await waitForFunction(() => Date.now() - time > 1000);

  await page.click('#mutationButtonImmediately', { clickCount: 2 });

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);
  await forceFlushReplay();

  const { breadcrumbs: breadcrumb2 } = getCustomRecordingEvents(await reqPromise2);

  const slowClickBreadcrumbs = breadcrumbs
    .concat(breadcrumb2)
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

async function waitForFunction(cb: () => boolean, timeout = 2000, increment = 100) {
  while (timeout > 0 && !cb()) {
    await new Promise(resolve => setTimeout(resolve, increment));
    await waitForFunction(cb, timeout - increment, increment);
  }
}
