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

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await forceFlushReplay();
    const res0 = getCustomRecordingEvents(await reqPromise0);

    await page.locator('[data-console]').click();
    await forceFlushReplay();

    const res1 = getCustomRecordingEvents(await reqPromise1);

    const breadcrumbs = [...res0.breadcrumbs, ...res1.breadcrumbs];
    const spans = [...res0.performanceSpans, ...res1.performanceSpans];
    expect(breadcrumbs.filter(breadcrumb => breadcrumb.category === 'replay.throttled').length).toBe(1);
    // replay.throttled breadcrumb does *not* use the throttledAddEvent as we
    // alwants want that breadcrumb to be present in replay
    expect(breadcrumbs.length + spans.length).toBe(THROTTLE_LIMIT + 1);
  },
);
