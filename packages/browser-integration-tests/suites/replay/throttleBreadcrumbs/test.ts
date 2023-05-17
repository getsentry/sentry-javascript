import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

const THROTTLE_LIMIT = 300;

sentryTest(
  'throttles breadcrumbs when many `console.log` are made at the same time',
  async ({ getLocalTestUrl, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const reqPromise0 = waitForReplayRequest(page, 0);
    const reqPromise1 = waitForReplayRequest(page, 1);

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
    expect(breadcrumbs.length).toBe(THROTTLE_LIMIT);
    expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'replay.throttled').length).toBe(1);
  },
);
