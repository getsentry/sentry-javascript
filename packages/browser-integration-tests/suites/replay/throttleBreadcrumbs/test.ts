import { expect } from '@playwright/test';
import type { Breadcrumb } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import type { PerformanceSpan } from '../../../utils/replayHelpers';
import {
  getCustomRecordingEvents,
  getReplayEventFromRequest,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers';

const COUNT = 250;
const THROTTLE_LIMIT = 300;

sentryTest(
  'throttles breadcrumbs when many requests are made at the same time',
  async ({ getLocalTestUrl, page, forceFlushReplay, browserName }) => {
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
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

    let scriptsLoaded = 0;
    let fetchLoaded = 0;

    await page.route('**/virtual-assets/script-**', route => {
      scriptsLoaded++;
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: `const aha = ${'xx'.repeat(20_000)};`,
      });
    });

    await page.route('**/virtual-assets/fetch-**', route => {
      fetchLoaded++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fetchResponse: 'aa'.repeat(20_000) }),
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await reqPromise0;

    let collectedSpans: PerformanceSpan[] = [];
    let collectedBreadcrumbs: Breadcrumb[] = [];

    page.on('response', response => {
      // We only capture sentry stuff
      if (!response.url().includes('https://dsn.ingest.sentry')) {
        return;
      }

      // If this is undefined, this is not a replay request
      if (!getReplayEventFromRequest(response.request())) {
        return;
      }

      const { performanceSpans, breadcrumbs } = getCustomRecordingEvents(response);

      collectedSpans.push(
        ...performanceSpans.filter(span => span.op === 'resource.script' || span.op === 'resource.fetch'),
      );
      collectedBreadcrumbs.push(...breadcrumbs.filter(breadcrumb => breadcrumb.category === 'replay.throttled'));
    });

    await page.click('[data-network]');
    await page.click('[data-fetch]');

    await page.waitForFunction('window.__isLoaded()');
    await forceFlushReplay();

    await waitForFunction(() => collectedBreadcrumbs.length === 1, 6_000, 100);

    // All assets have been _loaded_
    expect(scriptsLoaded).toBe(COUNT);
    expect(fetchLoaded).toBe(COUNT);

    // But only some have been captured by replay
    // We give it some wiggle room to account for flakyness
    expect(collectedSpans.length).toBeLessThanOrEqual(THROTTLE_LIMIT);
    expect(collectedSpans.length).toBeGreaterThanOrEqual(THROTTLE_LIMIT - 50);
    expect(collectedBreadcrumbs.length).toBe(1);

    // Now we wait for 6s (5s + some wiggle room), and make some requests again
    await page.waitForTimeout(6_000);
    await forceFlushReplay();

    // Reset collectors
    collectedSpans = [];
    collectedBreadcrumbs = [];

    await page.click('[data-network]');
    await page.click('[data-fetch]');

    await page.waitForFunction('window.__isLoaded(2)');
    await forceFlushReplay();

    await waitForFunction(() => collectedBreadcrumbs.length === 1, 6_000, 100);

    // All assets have been _loaded_
    expect(scriptsLoaded).toBe(COUNT * 2);
    expect(fetchLoaded).toBe(COUNT * 2);

    // But only some have been captured by replay
    // We give it some wiggle room to account for flakyness
    expect(collectedSpans.length).toBeLessThanOrEqual(THROTTLE_LIMIT);
    expect(collectedSpans.length).toBeGreaterThanOrEqual(THROTTLE_LIMIT - 50);
    expect(collectedBreadcrumbs.length).toBe(1);
  },
);

async function waitForFunction(cb: () => boolean, timeout = 2000, increment = 100) {
  while (timeout > 0 && !cb()) {
    await new Promise(resolve => setTimeout(resolve, increment));
    await waitForFunction(cb, timeout - increment, increment);
  }
}
