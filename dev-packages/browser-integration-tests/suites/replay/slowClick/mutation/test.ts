import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('mutation after threshold results in slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);
  await forceFlushReplay();

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
    }),

    page.click('#mutationButton'),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

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
  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeLessThan(3500);
});

sentryTest('multiple clicks are counted', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
    }),
    page.click('#mutationButton', { clickCount: 4 }),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

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
  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeLessThan(3500);
});

sentryTest('immediate mutation does not trigger slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);
  await forceFlushReplay();

  let slowClickCount = 0;

  page.on('response', res => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    const slowClicks = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
    slowClickCount += slowClicks.length;
  });

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (_event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
    }),
    page.click('#mutationButtonImmediately'),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

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

  // Ensure we wait for timeout, to make sure no slow click is created
  // Waiting for 3500 + 1s rounding room
  await new Promise(resolve => setTimeout(resolve, 4500));
  await forceFlushReplay();

  expect(slowClickCount).toBe(0);
});

sentryTest('inline click handler does not trigger slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);
  await forceFlushReplay();

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
    }),
    page.click('#mutationButtonInline'),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

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

sentryTest('mouseDown events are considered', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  await Promise.all([waitForReplayRequest(page, 0), page.goto(url)]);

  const [req1] = await Promise.all([
    waitForReplayRequest(page, (event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
    }),
    page.click('#mouseDownButton'),
  ]);

  const { breadcrumbs } = getCustomRecordingEvents(req1);

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
