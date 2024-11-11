import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('captures component name attribute when available', async ({ forceFlushReplay, getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;
  await forceFlushReplay();

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });
  const reqPromise2 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.input');
  });

  await page.locator('#button').click();

  await page.locator('#input').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hello', { delay: 10 });

  await forceFlushReplay();
  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);
  const { breadcrumbs: breadcrumbs2 } = getCustomRecordingEvents(await reqPromise2);

  // Combine the two together
  breadcrumbs2.forEach(breadcrumb => {
    if (!breadcrumbs.some(b => b.category === breadcrumb.category && b.timestamp === breadcrumb.timestamp)) {
      breadcrumbs.push(breadcrumb);
    }
  });

  expect(breadcrumbs).toEqual([
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.click',
      message: 'body > MyCoolButton',
      data: {
        nodeId: expect.any(Number),
        node: {
          attributes: {
            id: 'button',
            'data-sentry-component': 'MyCoolButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '**',
        },
      },
    },
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.input',
      message: 'body > MyCoolInput',
      data: {
        nodeId: expect.any(Number),
        node: {
          attributes: {
            id: 'input',
            'data-sentry-component': 'MyCoolInput',
          },
          id: expect.any(Number),
          tagName: 'input',
          textContent: '',
        },
      },
    },
  ]);
});

sentryTest('sets element name to component name attribute', async ({ forceFlushReplay, getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;
  await forceFlushReplay();

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.click');
  });
  const reqPromise2 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.input');
  });

  await page.locator('#button2').click();

  await page.locator('#input2').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hello', { delay: 10 });

  await forceFlushReplay();
  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);
  const { breadcrumbs: breadcrumbs2 } = getCustomRecordingEvents(await reqPromise2);

  // Combine the two together
  breadcrumbs2.forEach(breadcrumb => {
    if (!breadcrumbs.some(b => b.category === breadcrumb.category && b.timestamp === breadcrumb.timestamp)) {
      breadcrumbs.push(breadcrumb);
    }
  });

  expect(breadcrumbs).toEqual([
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.click',
      message: 'body > StyledCoolButton',
      data: {
        nodeId: expect.any(Number),
        node: {
          attributes: {
            id: 'button2',
            'data-sentry-component': 'StyledCoolButton',
          },
          id: expect.any(Number),
          tagName: 'button',
          textContent: '**',
        },
      },
    },
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.input',
      message: 'body > StyledCoolInput',
      data: {
        nodeId: expect.any(Number),
        node: {
          attributes: {
            id: 'input2',
            'data-sentry-component': 'StyledCoolInput',
          },
          id: expect.any(Number),
          tagName: 'input',
          textContent: '',
        },
      },
    },
  ]);
});
