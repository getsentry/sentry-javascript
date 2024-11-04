import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should capture console messages in replay', async ({ getLocalTestPath, page, forceFlushReplay }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await Promise.all([page.goto(url), reqPromise0]);

  const reqPromise1 = waitForReplayRequest(
    page,
    (_event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'console');
    },
    5_000,
  );

  await page.locator('[data-log]').click();

  // Sometimes this doesn't seem to trigger, so we trigger it twice to be sure...
  const [req1] = await Promise.all([reqPromise1, page.locator('[data-log]').click()]);
  await forceFlushReplay();

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'console')).toEqual(
    expect.arrayContaining([
      {
        timestamp: expect.any(Number),
        type: 'default',
        category: 'console',
        data: { arguments: ['Test log', '[HTMLElement: HTMLBodyElement]'], logger: 'console' },
        level: 'log',
        message: 'Test log [object HTMLBodyElement]',
      },
    ]),
  );
});

sentryTest('should capture very large console logs', async ({ getLocalTestPath, page, forceFlushReplay }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);

  const url = await getLocalTestPath({ testDir: __dirname });

  await Promise.all([page.goto(url), reqPromise0]);

  const reqPromise1 = waitForReplayRequest(
    page,
    (_event, res) => {
      const { breadcrumbs } = getCustomRecordingEvents(res);

      return breadcrumbs.some(breadcrumb => breadcrumb.category === 'console');
    },
    5_000,
  );

  const [req1] = await Promise.all([reqPromise1, page.locator('[data-log-large]').click()]);
  await forceFlushReplay();

  const { breadcrumbs } = getCustomRecordingEvents(req1);

  expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'console')).toEqual(
    expect.arrayContaining([
      {
        timestamp: expect.any(Number),
        type: 'default',
        category: 'console',
        data: {
          arguments: [expect.any(String)],
          logger: 'console',
          _meta: {
            warnings: ['CONSOLE_ARG_TRUNCATED'],
          },
        },
        level: 'log',
        message: '[object Object]',
      },
    ]),
  );
});
