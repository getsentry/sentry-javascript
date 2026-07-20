import { expect, test } from '@playwright/test';
import type { SerializedMetric } from '@sentry/core';
import { waitForMetric } from '@sentry-internal/test-utils';

const PROXY_SERVER_NAME = 'browser-bfcache';

function attr(metric: SerializedMetric, key: string): unknown {
  return metric.attributes?.[key]?.value;
}

function isNavigation(metric: SerializedMetric, outcome: 'hit' | 'miss'): boolean {
  return metric.name === 'browser.bfcache.navigation' && attr(metric, 'browser.bfcache.outcome') === outcome;
}

function chromeMajorVersion(browserVersion: string): number {
  return parseInt(browserVersion.split('.')[0]!, 10);
}

test('reports a hit on a genuine back/forward-cache restore', async ({ page }) => {
  const hitPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'hit'));

  await page.goto('/');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  // Renderer-initiated history navigation restores the page from bfcache.
  // (Playwright's CDP `goBack` bypasses bfcache, so we trigger it from within the page.)
  await page.evaluate(() => history.back());

  // Fail fast with a clear signal if the environment did not actually restore from bfcache.
  await page.waitForFunction(() => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true, {
    timeout: 5000,
  });

  // No manual flush(): this asserts the real capture -> buffer -> send path.
  const hit = await hitPromise;
  expect(hit.value).toBe(1);
});

test('reports a miss with notRestoredReasons when an unload listener blocks bfcache', async ({ page }) => {
  const missPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'miss'));
  const unloadReasonPromise = waitForMetric(
    PROXY_SERVER_NAME,
    metric =>
      metric.name === 'browser.bfcache.not_restored' && attr(metric, 'browser.bfcache.reason') === 'unload-listener',
  );
  // Chrome reports a privacy-masked reason alongside the real one; the integration must classify it
  // as a `masked` frame. This is our only real-browser coverage of the masked-frame path.
  const maskedReasonPromise = waitForMetric(
    PROXY_SERVER_NAME,
    metric => metric.name === 'browser.bfcache.not_restored' && attr(metric, 'browser.bfcache.reason') === 'masked',
  );
  const reloadDurationPromise = waitForMetric(
    PROXY_SERVER_NAME,
    metric => metric.name === 'browser.bfcache.reload.duration',
  );

  await page.goto('/?botch=unload');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  // The unload listener makes the page ineligible, so this back navigation is a fresh reload (a miss).
  await page.evaluate(() => history.back());
  await page.waitForFunction(
    () =>
      (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ===
      'back_forward',
    { timeout: 5000 },
  );

  const miss = await missPromise;
  expect(miss.value).toBe(1);
  expect(attr(miss, 'browser.bfcache.not_restored_reason_count')).toBeGreaterThanOrEqual(1);

  const unloadReason = await unloadReasonPromise;
  expect(attr(unloadReason, 'browser.bfcache.frame')).toBe('top');

  const maskedReason = await maskedReasonPromise;
  expect(attr(maskedReason, 'browser.bfcache.frame')).toBe('masked');

  const reloadDuration = await reloadDurationPromise;
  expect(reloadDuration.type).toBe('distribution');
  expect(reloadDuration.unit).toBe('millisecond');
  expect(typeof reloadDuration.value).toBe('number');
});

test('reports a miss for an open WebSocket on Chrome < 149 (a hit from 149 on)', async ({ page, browser }) => {
  const major = chromeMajorVersion(browser.version());
  const websocketBlocks = major < 149;

  // Set up every waiter before navigating: the navigation and not_restored metrics flush in the same
  // envelope, and `waitForMetric` only matches metrics that arrive after it was created.
  const outcomePromise = waitForMetric(PROXY_SERVER_NAME, metric =>
    isNavigation(metric, websocketBlocks ? 'miss' : 'hit'),
  );
  const websocketReasonPromise = websocketBlocks
    ? waitForMetric(
        PROXY_SERVER_NAME,
        metric =>
          metric.name === 'browser.bfcache.not_restored' && attr(metric, 'browser.bfcache.reason') === 'websocket',
      )
    : null;

  await page.goto('/?botch=websocket');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');
  // Only proceed once the socket is actually open, otherwise it wouldn't block anything.
  await page.waitForFunction(() => (window as unknown as { __wsOpen?: boolean }).__wsOpen === true, { timeout: 5000 });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());

  const outcome = await outcomePromise;
  expect(outcome.value).toBe(1);

  if (websocketReasonPromise) {
    const websocketReason = await websocketReasonPromise;
    expect(attr(websocketReason, 'browser.bfcache.frame')).toBe('top');
  }
});

test('reports a miss with an idbversionchangeevent reason when a connection blocks an upgrade', async ({ page }) => {
  const missPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'miss'));
  const reasonPromise = waitForMetric(
    PROXY_SERVER_NAME,
    metric =>
      metric.name === 'browser.bfcache.not_restored' &&
      attr(metric, 'browser.bfcache.reason') === 'idbversionchangeevent',
  );

  await page.goto('/?botch=indexeddb');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');
  // Only proceed once the version upgrade is actually blocked by the open connection.
  await page.waitForFunction(() => (window as unknown as { __idbBlocked?: boolean }).__idbBlocked === true, {
    timeout: 5000,
  });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());

  const miss = await missPromise;
  expect(miss.value).toBe(1);
  const reason = await reasonPromise;
  expect(attr(reason, 'browser.bfcache.frame')).toBe('top');
});

test('reports a miss with a response-cache-control-no-store reason when a CCNS page cookie changes', async ({
  page,
}) => {
  const missPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'miss'));
  const reasonPromise = waitForMetric(
    PROXY_SERVER_NAME,
    metric =>
      metric.name === 'browser.bfcache.not_restored' &&
      attr(metric, 'browser.bfcache.reason') === 'response-cache-control-no-store',
  );

  await page.goto('/?botch=nostore');
  await page.waitForFunction(() => (window as unknown as { __nostoreReady?: boolean }).__nostoreReady === true, {
    timeout: 5000,
  });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());

  const miss = await missPromise;
  expect(miss.value).toBe(1);
  const reason = await reasonPromise;
  expect(attr(reason, 'browser.bfcache.frame')).toBe('top');
});

test('restores a page whose embedded iframe is bfcache-eligible', async ({ page }) => {
  const hitPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'hit'));

  await page.goto('/?botch=iframe-clean');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');
  await page.waitForFunction(() => (window as unknown as { __iframeLoaded?: boolean }).__iframeLoaded === true, {
    timeout: 5000,
  });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());
  await page.waitForFunction(() => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true, {
    timeout: 5000,
  });

  const hit = await hitPromise;
  expect(hit.value).toBe(1);
});

test('reports a child-frame reason when an ineligible iframe blocks the top page', async ({ page }) => {
  const missPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'miss'));
  // The blocker lives in the child frame, so the reason must be classified as a `child` frame.
  const childReasonPromise = waitForMetric(
    PROXY_SERVER_NAME,
    metric =>
      metric.name === 'browser.bfcache.not_restored' &&
      attr(metric, 'browser.bfcache.reason') === 'unload-listener' &&
      attr(metric, 'browser.bfcache.frame') === 'child',
  );

  await page.goto('/?botch=iframe-unload');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');
  await page.waitForFunction(() => (window as unknown as { __iframeLoaded?: boolean }).__iframeLoaded === true, {
    timeout: 5000,
  });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());

  const miss = await missPromise;
  expect(miss.value).toBe(1);

  const childReason = await childReasonPromise;
  expect(attr(childReason, 'browser.bfcache.frame')).toBe('child');
});

test('does not treat an ordinary forward navigation as a restore', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  const restored = await page.evaluate(
    () => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true,
  );
  expect(restored).toBe(false);
});
