import { expect } from '@playwright/test';
import type { Breadcrumb } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

const THROTTLE_LIMIT = 300;

function isConsole(breadcrumb: Breadcrumb) {
  return breadcrumb.category === 'console';
}

sentryTest(
  'throttles breadcrumbs when many `console.log` are made at the same time',
  async ({ getLocalTestUrl, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);
    const reqPromise2 = waitForReplayRequest(page, 2);
    const reqPromise3 = waitForReplayRequest(page, 3);
    const reqPromise4 = waitForReplayRequest(page, 4);

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

    await page.click('[data-console]');
    await forceFlushReplay();

    const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1);

    // 1 click breadcrumb + 1 throttled breadcrumb is why console logs are less
    // than throttle limit
    expect(breadcrumbs.filter(isConsole).length).toBe(THROTTLE_LIMIT - 2);
    expect(breadcrumbs.length).toBe(THROTTLE_LIMIT);
    expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'replay.throttled').length).toBe(1);

    await page.click('[data-console]');
    await forceFlushReplay();

    const { breadcrumbs: breadcrumbs2 } = getCustomRecordingEvents(await reqPromise2);

    // No more breadcrumbs because we are still throttled
    expect(breadcrumbs2.filter(isConsole).length).toBe(0);
    expect(breadcrumbs2.filter(breadcrumb => breadcrumb.category === 'replay.throttled').length).toBe(0);

    // XXX: This is potentially a bug? looks to be only a memory span
    await reqPromise3;

    await new Promise(resolve => setTimeout(resolve, 5500));
    await page.click('[data-console]');

    await forceFlushReplay();
    const { breadcrumbs: breadcrumbs3 } = getCustomRecordingEvents(await reqPromise4);

    expect(breadcrumbs3.filter(isConsole).length).toBe(THROTTLE_LIMIT - 1);
    expect(breadcrumbs3.filter(breadcrumb => breadcrumb.category === 'replay.throttled').length).toBe(1);
  },
);
