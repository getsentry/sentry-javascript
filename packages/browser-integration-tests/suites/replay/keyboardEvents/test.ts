import { expect } from '@playwright/test';
import { IncrementalSource } from '@sentry-internal/rrweb';
import type { inputData } from '@sentry-internal/rrweb/typings/types';

import { sentryTest } from '../../../utils/fixtures';
import { IncrementalRecordingSnapshot, getCustomRecordingEvents } from '../../../utils/replayHelpers';
import {
  getIncrementalRecordingSnapshots,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

function isInputMutation(
  snap: IncrementalRecordingSnapshot,
): snap is IncrementalRecordingSnapshot & { data: inputData } {
  return snap.data.source == IncrementalSource.Input;
}

sentryTest('captures keyboard events', async ({ forceFlushReplay, getLocalTestPath, page }) => {
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

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await reqPromise0;
  await forceFlushReplay();

  const reqPromise1 = waitForReplayRequest(page, (event, res) => {
    return getCustomRecordingEvents(res).breadcrumbs.some(breadcrumb => breadcrumb.category === 'ui.keyDown');
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
