import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('mutation after timeout results in slow click', async ({ getLocalTestUrl, page }) => {
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

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  });

  await page.click('#mutationButtonLate');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.slowClickDetected',
      data: {
        endReason: 'timeout',
        node: {
          attributes: {
            id: 'mutationButtonLate',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ****',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: 2000,
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

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  });

  await page.click('#consoleLogButton');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.slowClickDetected',
      data: {
        endReason: 'timeout',
        node: {
          attributes: {
            id: 'consoleLogButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******* ***',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: 2000,
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#consoleLogButton',
      timestamp: expect.any(Number),
    },
  ]);
});
