import { expect } from '@playwright/test';
import type { SerializedMetric } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipMetricsTest, waitForMetrics } from '../../../utils/helpers';

function byName(metrics: SerializedMetric[], name: string): SerializedMetric[] {
  return metrics.filter(m => m.name === name);
}

function attr(m: SerializedMetric, key: string): unknown {
  return m.attributes?.[key]?.value;
}

// Note on bfcache under Playwright:
// Playwright launches Chromium with `--disable-back-forward-cache` (and the attached CDP session
// blocks bfcache regardless), so a *real* bfcache restore cannot be reproduced here. We therefore
// drive the hit path by dispatching the same `pageshow` signal the browser would emit on restore,
// which is exactly the contract our integration reacts to. The miss path uses a real back/forward
// navigation, which is always a fresh load in this environment.

sentryTest('reports outcome:hit when a page is restored from bfcache', async ({ getLocalTestUrl, page, browserName }) => {
  if (shouldSkipMetricsTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const metricsPromise = waitForMetrics(page, metrics =>
    byName(metrics, 'browser.bfcache.navigation').some(m => attr(m, 'browser.bfcache.outcome') === 'hit'),
  );

  // Simulate the browser restoring this page from bfcache.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    // Metrics are buffered and only flushed when the page is hidden, so flush explicitly.
    return (window as { Sentry: { flush: () => Promise<boolean> } }).Sentry.flush();
  });

  const metrics = await metricsPromise;
  const hit = byName(metrics, 'browser.bfcache.navigation').find(m => attr(m, 'browser.bfcache.outcome') === 'hit');

  expect(hit).toMatchObject({ name: 'browser.bfcache.navigation', type: 'counter', value: 1 });
  expect(attr(hit!, 'browser.bfcache.navigation_type')).toBe('back-forward-cache');
});

sentryTest('reports outcome:miss on a back/forward navigation that is not restored', async ({
  getLocalTestUrl,
  page,
  browserName,
}) => {
  if (shouldSkipMetricsTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  // Belt-and-suspenders: an unload listener makes the page bfcache-ineligible even if a future
  // Playwright stops disabling bfcache by default.
  await page.evaluate(() => window.addEventListener('unload', () => {}));
  await page.click('#nav');
  await page.waitForLoadState('load');

  const metricsPromise = waitForMetrics(page, metrics =>
    byName(metrics, 'browser.bfcache.navigation').some(m => attr(m, 'browser.bfcache.outcome') === 'miss'),
  );

  // Back navigation does a fresh reload (PerformanceNavigationTiming.type === 'back_forward').
  await page.goBack();
  await page.waitForLoadState('load');
  await page.evaluate(() => (window as { Sentry: { flush: () => Promise<boolean> } }).Sentry.flush());

  const metrics = await metricsPromise;
  const miss = byName(metrics, 'browser.bfcache.navigation').find(m => attr(m, 'browser.bfcache.outcome') === 'miss');

  expect(miss).toMatchObject({ name: 'browser.bfcache.navigation', type: 'counter', value: 1 });
  expect(attr(miss!, 'browser.bfcache.navigation_type')).toBe('back-forward');

  // A miss does a real reload, so we also report how expensive that reload was.
  const reload = byName(metrics, 'browser.bfcache.reload.duration')[0];
  expect(reload).toMatchObject({ name: 'browser.bfcache.reload.duration', type: 'distribution', unit: 'millisecond' });
  expect(typeof reload?.value).toBe('number');
});
