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
    await forceFlushReplay();
    const res0 = getCustomRecordingEvents(await reqPromise0);

    await page.click('[data-console]');
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
