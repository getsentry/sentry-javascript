import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../../utils/replayHelpers';

sentryTest('mutation after threshold results in slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const replayRequestPromise = waitForReplayRequest(page, 0);

  const segmentReqWithSlowClickBreadcrumbPromise = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  });

  await page.goto(url);
  await replayRequestPromise;

  await forceFlushReplay();

  await page.locator('#mutationButton').click();

  const segmentReqWithSlowClick = await segmentReqWithSlowClickBreadcrumbPromise;

  const { breadcrumbs } = getCustomRecordingEvents(segmentReqWithSlowClick);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');

  expect(slowClickBreadcrumbs).toContainEqual({
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
  });

  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeGreaterThan(3000);
  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeLessThan(3501);
});

sentryTest('multiple clicks are counted', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const replayRequestPromise = waitForReplayRequest(page, 0);
  const segmentReqWithSlowClickBreadcrumbPromise = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  });

  await page.goto(url);
  await replayRequestPromise;

  await page.locator('#mutationButton').click({ clickCount: 4 });

  const segmentReqWithSlowClick = await segmentReqWithSlowClickBreadcrumbPromise;

  const { breadcrumbs } = getCustomRecordingEvents(segmentReqWithSlowClick);

  const slowClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
  const multiClickBreadcrumbs = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.multiClick');

  expect(slowClickBreadcrumbs).toContainEqual({
    category: 'ui.slowClickDetected',
    type: 'default',
    data: {
      endReason: expect.stringMatching(/^(mutation|timeout)$/),
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
  });
  expect(multiClickBreadcrumbs.length).toEqual(0);

  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeGreaterThan(3000);
  expect(slowClickBreadcrumbs[0]?.data?.timeAfterClickMs).toBeLessThan(3501);
});

sentryTest('immediate mutation does not trigger slow click', async ({ forceFlushReplay, getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const replayRequestPromise = waitForReplayRequest(page, 0);
  const segmentReqWithClickBreadcrumbPromise = waitForReplayRequest(page, (_event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });

  await page.goto(url);
  await replayRequestPromise;
  await forceFlushReplay();

  let slowClickCount = 0;

  page.on('response', res => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    const slowClicks = breadcrumbs.filter(breadcrumb => breadcrumb.category === 'ui.slowClickDetected');
    slowClickCount += slowClicks.length;
  });

  await page.locator('#mutationButtonImmediately').click();

  const segmentReqWithSlowClick = await segmentReqWithClickBreadcrumbPromise;

  const { breadcrumbs } = getCustomRecordingEvents(segmentReqWithSlowClick);

  expect(breadcrumbs).toContainEqual({
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
  });

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

  const url = await getLocalTestUrl({ testDir: __dirname });

  const replayRequestPromise = waitForReplayRequest(page, 0);
  const segmentReqWithClickBreadcrumbPromise = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });

  await page.goto(url);
  await replayRequestPromise;

  await forceFlushReplay();

  await page.locator('#mutationButtonInline').click();

  const segmentReqWithClick = await segmentReqWithClickBreadcrumbPromise;

  const { breadcrumbs } = getCustomRecordingEvents(segmentReqWithClick);

  expect(breadcrumbs).toContainEqual({
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
  });
});

sentryTest('mouseDown events are considered', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const replayRequestPromise = waitForReplayRequest(page, 0);
  const segmentReqWithClickBreadcrumbPromise = waitForReplayRequest(page, (event, res) => {
    const { breadcrumbs } = getCustomRecordingEvents(res);

    return breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });

  await page.goto(url);
  await replayRequestPromise;

  await page.locator('#mouseDownButton').click();
  const segmentReqWithClick = await segmentReqWithClickBreadcrumbPromise;

  const { breadcrumbs } = getCustomRecordingEvents(segmentReqWithClick);

  expect(breadcrumbs).toContainEqual({
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
  });
});
