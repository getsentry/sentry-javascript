import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('captures keyboard events', async ({ forceFlushReplay, getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;
  await forceFlushReplay();

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.keyDown');
  });
  const reqPromise2 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.input');
  });

  // Trigger keyboard unfocused
  await page.keyboard.press('a');
  await page.keyboard.press('Control+A');

  // Type unfocused
  await page.keyboard.type('Hello', { delay: 10 });

  // Type focused
  await page.locator('#input').focus();

  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hello', { delay: 10 });

  await forceFlushReplay();
  const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);
  const { breadcrumbs: breadcrumbs2 } = getCustomRecordingEvents(await reqPromise2);

  // Combine the two together
  // Usually, this should all be in a single request, but it _may_ be split out, so we combine this together here.
  breadcrumbs2.forEach(breadcrumb => {
    if (!breadcrumbs.some(b => b.category === breadcrumb.category && b.timestamp === breadcrumb.timestamp)) {
      breadcrumbs.push(breadcrumb);
    }
  });

  expect(breadcrumbs).toEqual([
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.keyDown',
      message: 'body',
      data: {
        nodeId: expect.any(Number),
        node: {
          attributes: {},
          id: expect.any(Number),
          tagName: 'body',
          textContent: '',
        },
        metaKey: false,
        shiftKey: false,
        ctrlKey: true,
        altKey: false,
        key: 'Control',
      },
    },
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.keyDown',
      message: 'body',
      data: {
        nodeId: expect.any(Number),
        node: { attributes: {}, id: expect.any(Number), tagName: 'body', textContent: '' },
        metaKey: false,
        shiftKey: false,
        ctrlKey: true,
        altKey: false,
        key: 'A',
      },
    },
    {
      timestamp: expect.any(Number),
      type: 'default',
      category: 'ui.input',
      message: 'body > input#input',
      data: {
        nodeId: expect.any(Number),
        node: {
          attributes: { id: 'input' },
          id: expect.any(Number),
          tagName: 'input',
          textContent: '',
        },
      },
    },
  ]);
});
