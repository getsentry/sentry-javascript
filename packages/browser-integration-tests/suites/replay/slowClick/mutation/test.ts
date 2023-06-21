import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('mutation after threshold results in slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
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
  await forceFlushReplay();
  await reqPromise0;

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  });

  await page.click('#mutationButton');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.slowClickDetected',
      type: 'default',
      data: {
        endReason: 'mutation',
        clickCount: 1,
        node: {
          attributes: {
            id: 'mutationButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ********',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButton',
      timestamp: expect.any(Number),
    },
  ]);

  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeGreaterThan(3000);
  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeLessThan(3100);
});

sentryTest('multiple clicks are counted', async ({ getLocalTestUrl, page }) => {
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

  void page.click('#mutationButton', { clickCount: 4 });

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  const multiClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.multiClick');

  expect(slowClickBreadcrumbs).toEqual([
    {
      category: 'ui.slowClickDetected',
      type: 'default',
      data: {
        endReason: 'mutation',
        clickCount: 4,
        node: {
          attributes: {
            id: 'mutationButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ********',
        },
        nodeId: expect.any(Number),
        timeAfterClickMs: expect.any(Number),
        url: 'http://sentry-test.io/index.html',
      },
      message: 'body > button#mutationButton',
      timestamp: expect.any(Number),
    },
  ]);
  expect(multiClickBreadcrumbs.length).toEqual(0);

  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeGreaterThan(3000);
  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeLessThan(3100);
});

sentryTest(
  'immediate mutation does not trigger slow click',
  async ({ forceFlushReplay, browserName, getLocalTestUrl, page }) => {
    // This test seems to only be flakey on firefox
    if (shouldSkipReplayTest() || ['firefox'].includes(browserName)) {
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
    await forceFlushReplay();
    await reqPromise0;

    const reqPromise1 = waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
    });

    await page.click('#mutationButtonImmediately');

    const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

    expect(breadcrumbs).toEqual([
      {
        category: 'ui.click',
        data: {
          node: {
            attributes: {
              id: 'mutationButtonImmediately',
            },
            id: expect.any(Number),
            tagName: 'button',
            textContent: '******* ******** ***********',
          },
          nodeId: expect.any(Number),
        },
        message: 'body > button#mutationButtonImmediately',
        timestamp: expect.any(Number),
        type: 'default',
      },
    ]);
  },
);

sentryTest('inline click handler does not trigger slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
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
  await forceFlushReplay();
  await reqPromise0;

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });

  await page.click('#mutationButtonInline');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            id: 'mutationButtonInline',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ***********',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > button#mutationButtonInline',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);
});

sentryTest('mouseDown events are considered', async ({ browserName, getLocalTestUrl, page }) => {
  // This test seems to only be flakey on firefox
  if (shouldSkipReplayTest() || ['firefox'].includes(browserName)) {
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

  await page.click('#mouseDownButton');

  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

  expect(breadcrumbs).toEqual([
    {
      category: 'ui.click',
      data: {
        node: {
          attributes: {
            id: 'mouseDownButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '******* ******** ** ***** ****',
        },
        nodeId: expect.any(Number),
      },
      message: 'body > button#mouseDownButton',
      timestamp: expect.any(Number),
      type: 'default',
    },
  ]);
});
