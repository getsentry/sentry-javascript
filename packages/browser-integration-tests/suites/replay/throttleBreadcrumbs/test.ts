import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getCustomRecordingEvents, shouldSkipReplayTest, waitForReplayRequest } from '../../../utils/replayHelpers';

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

    const reqPromise1 = waitForReplayRequest(
      page,
      (_event, res) => {
        const { performanceSpans } = getCustomRecordingEvents(res);

        return performanceSpans.some(span => span.op === 'resource.script');
      },
      10_000,
    );
    const reqPromise1Breadcrumbs = waitForReplayRequest(
      page,
      (_event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'replay.throttled');
      },
      10_000,
    );

    await page.click('[data-network]');
    await page.click('[data-fetch]');

    await page.waitForFunction('window.__isLoaded()');
    await forceFlushReplay();

    const { performanceSpans } = getCustomRecordingEvents(await reqPromise1);
    const { breadcrumbs } = getCustomRecordingEvents(await reqPromise1Breadcrumbs);

    // All assets have been _loaded_
    expect(scriptsLoaded).toBe(COUNT);
    expect(fetchLoaded).toBe(COUNT);

    // But only some have been captured by replay
    // We check for <= THROTTLE_LIMIT, as there have been some captured before, which take up some of the throttle limit
    expect(performanceSpans.length).toBeLessThanOrEqual(THROTTLE_LIMIT);
    expect(performanceSpans.length).toBeGreaterThan(THROTTLE_LIMIT - 50);

    expect(breadcrumbs.filter(({ category }) => category === 'replay.throttled').length).toBe(1);

    // Now we wait for 6s (5s + some wiggle room), and make some requests again
    await page.waitForTimeout(7_000);
    await forceFlushReplay();

    const reqPromise2 = waitForReplayRequest(
      page,
      (_event, res) => {
        const { performanceSpans } = getCustomRecordingEvents(res);

        return performanceSpans.some(span => span.op === 'resource.script');
      },
      10_000,
    );
    const reqPromise2Breadcrumbs = waitForReplayRequest(
      page,
      (_event, res) => {
        const { breadcrumbs } = getCustomRecordingEvents(res);

        return breadcrumbs.some(breadcrumb => breadcrumb.category === 'replay.throttled');
      },
      10_000,
    );

    await page.click('[data-network]');
    await page.click('[data-fetch]');

    await page.waitForFunction('window.__isLoaded(2)');
    await forceFlushReplay();

    const { performanceSpans: performanceSpans2 } = getCustomRecordingEvents(await reqPromise2);
    const { breadcrumbs: breadcrumbs2 } = getCustomRecordingEvents(await reqPromise2Breadcrumbs);

    // All assets have been _loaded_
    expect(scriptsLoaded).toBe(COUNT * 2);
    expect(fetchLoaded).toBe(COUNT * 2);

    // But only some have been captured by replay
    // We check for <= THROTTLE_LIMIT, as there have been some captured before, which take up some of the throttle limit
    expect(performanceSpans2.length).toBeLessThanOrEqual(THROTTLE_LIMIT);
    expect(performanceSpans2.length).toBeGreaterThan(THROTTLE_LIMIT - 50);

    expect(breadcrumbs2.filter(({ category }) => category === 'replay.throttled').length).toBe(1);
  },
);
