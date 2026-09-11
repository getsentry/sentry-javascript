import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { SerializedMetric } from '@sentry/core';
import {
  collectStreamedSpans,
  getSpanOp,
  hidePage,
  waitForMetric,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';

const PROXY_SERVER_NAME = 'browser-bfcache';
const BFCACHE_ORIGIN = 'auto.browser.bfcache';

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
  expect(attr(hit, 'sentry.origin')).toBe(BFCACHE_ORIGIN);
});

test('reports a miss with notRestoredReasons when an unload listener blocks bfcache', async ({ page }) => {
  const missPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'miss'));
  // An unload listener still makes the page ineligible, but from Chromium 151 on the only reason
  // Chrome hands out for it is the privacy-masked one. It's a top-frame reason, so the integration
  // must frame it positionally (`top`) and pass the value through untouched.
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
  expect(attr(miss, 'sentry.origin')).toBe(BFCACHE_ORIGIN);

  const maskedReason = await maskedReasonPromise;
  expect(attr(maskedReason, 'browser.bfcache.frame')).toBe('top');
  expect(attr(maskedReason, 'sentry.origin')).toBe(BFCACHE_ORIGIN);

  const reloadDuration = await reloadDurationPromise;
  expect(reloadDuration.type).toBe('distribution');
  expect(reloadDuration.unit).toBe('millisecond');
  expect(typeof reloadDuration.value).toBe('number');
  expect(attr(reloadDuration, 'sentry.origin')).toBe(BFCACHE_ORIGIN);
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
      attr(metric, 'browser.bfcache.reason') === 'idbversionchangeevent' &&
      attr(metric, 'browser.bfcache.frame') === 'child',
  );

  await page.goto('/?botch=iframe-blocked');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');
  await page.waitForFunction(() => (window as unknown as { __iframeLoaded?: boolean }).__iframeLoaded === true, {
    timeout: 5000,
  });
  // Only proceed once the child frame's version upgrade is actually blocked.
  await page.waitForFunction(
    () => {
      const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
      return (frame?.contentWindow as unknown as { __idbBlocked?: boolean } | undefined)?.__idbBlocked === true;
    },
    { timeout: 5000 },
  );

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());

  const miss = await missPromise;
  expect(miss.value).toBe(1);

  const childReason = await childReasonPromise;
  expect(attr(childReason, 'browser.bfcache.frame')).toBe('child');
});

// A bfcache freeze keeps the JS heap intact, so the parameterized route a routing integration set before
// navigating away is still on the scope at restore time. That's what lets the hit carry a low-cardinality
// segment name without any span running on the restore.
test('a hit carries the parameterized route that was on the scope before the freeze', async ({ page }) => {
  const hitPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'hit'));

  await page.goto('/');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  // Stand in for a routing integration stamping a parameterized route on the scope.
  await page.evaluate(() => {
    (
      window as unknown as { Sentry: { getCurrentScope(): { setTransactionName(n: string): void } } }
    ).Sentry.getCurrentScope().setTransactionName('/users/:id');
  });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());
  await page.waitForFunction(() => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true, {
    timeout: 5000,
  });

  const hit = await hitPromise;
  expect(attr(hit, 'sentry.segment.name')).toBe('/users/:id');
});

// Without a routing integration the scope has no transaction name, so the segment name falls back to
// `location.pathname` (page 1 is served at '/'). This matches how browserTracing names an unrouted pageload.
test('a hit falls back to the raw pathname when no route is on the scope', async ({ page }) => {
  const hitPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'hit'));

  await page.goto('/');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());
  await page.waitForFunction(() => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true, {
    timeout: 5000,
  });

  const hit = await hitPromise;
  expect(attr(hit, 'sentry.segment.name')).toBe('/');
});

// A miss is a full reload, so `pageshow` fires with a fresh scope before any route resolves. A route set
// before the freeze cannot survive it, so the miss falls back to the reloaded page's raw pathname ('/').
test('a miss reload does not carry a pre-freeze route', async ({ page }) => {
  const missPromise = waitForMetric(PROXY_SERVER_NAME, metric => isNavigation(metric, 'miss'));

  await page.goto('/?botch=unload');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  await page.evaluate(() => {
    (
      window as unknown as { Sentry: { getCurrentScope(): { setTransactionName(n: string): void } } }
    ).Sentry.getCurrentScope().setTransactionName('/users/:id');
  });

  await page.click('#to-page-2');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
  await page.waitForTimeout(500);

  await page.evaluate(() => history.back());
  await page.waitForFunction(
    () =>
      (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ===
      'back_forward',
    { timeout: 5000 },
  );

  const miss = await missPromise;
  expect(attr(miss, 'sentry.segment.name')).toBe('/');
});

test('does not treat an ordinary forward navigation as a restore', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

  const restored = await page.evaluate(
    () => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true,
  );
  expect(restored).toBe(false);
});

// The navigation span for a restore lives in `browserTracingIntegration`, not in the metrics
// integration above, so these run against `?tracing=1` (see `src/main.ts`).
test.describe('the navigation span for a restore', () => {
  async function restoreFromBfcache(page: Page): Promise<void> {
    await page.click('#to-page-2');
    await page.waitForFunction(() => document.title === 'BFCache E2E - Page 2');
    await page.waitForTimeout(500);

    // Renderer-initiated, because Playwright's CDP `goBack` bypasses bfcache.
    await page.evaluate(() => history.back());
    await page.waitForFunction(
      () => (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored === true,
      {
        timeout: 5000,
      },
    );
  }

  test('is a navigation segment marked as a bfcache restore', async ({ page }) => {
    const restorePromise = waitForStreamedSpan(
      PROXY_SERVER_NAME,
      span => span.is_segment && getSpanOp(span) === 'navigation',
    );

    await page.goto('/?tracing=1');
    await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

    await restoreFromBfcache(page);

    expect(await restorePromise).toMatchObject({
      is_segment: true,
      attributes: {
        'sentry.op': { type: 'string', value: 'navigation' },
        'sentry.origin': { type: 'string', value: 'auto.navigation.browser.bfcache' },
        'browser.navigation.type': { type: 'string', value: 'bfcache' },
      },
    });
  });

  // `PerformanceNavigationTiming` is not replaced on a restore and still describes the original
  // document load, so a span dated from it would start before the page was frozen. The same goes for
  // the performance entries folded in when the span ends: they all predate the restore, and are only
  // kept from dragging the start timestamp back by a guard keyed on the `navigation` op.
  test('starts at the restore, not at the original document load', async ({ page }) => {
    const pageloadPromise = waitForStreamedSpan(
      PROXY_SERVER_NAME,
      span => span.is_segment && getSpanOp(span) === 'pageload',
    );
    const restorePromise = waitForStreamedSpan(
      PROXY_SERVER_NAME,
      span => span.is_segment && getSpanOp(span) === 'navigation',
    );

    await page.goto('/?tracing=1');
    await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');
    const pageload = await pageloadPromise;

    await restoreFromBfcache(page);
    const restore = await restorePromise;

    // Both timestamps come from the page's own clock, so this stays free of host/browser skew. The
    // 500ms spent on page 2 is the floor for the gap.
    expect(restore.start_timestamp).toBeGreaterThan(pageload.start_timestamp + 0.4);
  });

  // Redirect detection turns a navigation that follows another one closely into a child
  // `navigation.redirect` span rather than a root navigation, and a restore starts a navigation
  // span like any other. A soft navigation is driven by a click, which is exactly what the redirect
  // heuristic treats as proof that a navigation was user-initiated, so the two must not collide.
  test('a soft navigation right after a restore is not treated as a redirect', async ({ page }) => {
    const spansPromise = collectStreamedSpans(PROXY_SERVER_NAME, spansOfTrace =>
      spansOfTrace.some(
        span =>
          span.is_segment &&
          getSpanOp(span) === 'navigation' &&
          span.attributes?.['sentry.origin']?.value === 'auto.navigation.browser',
      ),
    );

    await page.goto('/?tracing=1');
    await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

    await restoreFromBfcache(page);
    // No wait: the restore's idle span has to still be open, otherwise redirect detection never
    // engages and this would pass without exercising anything.
    await page.click('#soft-nav');

    const spans = await spansPromise;

    const softNavSpan = spans.find(
      span =>
        span.is_segment &&
        getSpanOp(span) === 'navigation' &&
        span.attributes?.['sentry.origin']?.value === 'auto.navigation.browser',
    )!;
    expect(softNavSpan.attributes?.['browser.navigation.type']).toBeUndefined();

    expect(spans.filter(span => getSpanOp(span) === 'navigation.redirect')).toEqual([]);
  });

  // `webVitals.bfcacheNavigations` is on by default, so the app opts into nothing for this.
  test('carries the vitals measured on the restore', async ({ page }) => {
    const spansPromise = collectStreamedSpans(
      PROXY_SERVER_NAME,
      spansOfTrace =>
        spansOfTrace.some(span => span.is_segment && getSpanOp(span) === 'navigation') &&
        spansOfTrace.some(span => getSpanOp(span) === 'ui.webvital.lcp') &&
        spansOfTrace.some(span => getSpanOp(span) === 'ui.webvital.cls') &&
        spansOfTrace.some(span => getSpanOp(span) === 'ui.interaction.click'),
    );

    await page.goto('/?tracing=1');
    await page.waitForFunction(() => document.title === 'BFCache E2E - Page 1');

    await restoreFromBfcache(page);

    // Interacting after the restore is what gives it an INP to report.
    await page.click('#slow-interaction');

    // CLS is only finalized on pagehide, unlike LCP which reports as soon as the restore paints.
    await hidePage(page);

    const spans = await spansPromise;
    const restoreSpan = spans.find(span => span.is_segment && getSpanOp(span) === 'navigation')!;
    const lcpSpan = spans.find(span => getSpanOp(span) === 'ui.webvital.lcp')!;
    const clsSpan = spans.find(span => getSpanOp(span) === 'ui.webvital.cls')!;
    const inpSpan = spans.find(span => getSpanOp(span) === 'ui.interaction.click')!;

    expect(restoreSpan.attributes).toMatchObject({
      'browser.navigation.type': { type: 'string', value: 'bfcache' },
    });

    // All three hang off the restore itself. They also carry the `bfcache` navigation type, so the
    // one reported first must not become the parent of the ones reported later.
    for (const vital of [lcpSpan, clsSpan, inpSpan]) {
      expect(vital.parent_span_id).toBe(restoreSpan.span_id);
      expect(vital.attributes).toMatchObject({
        'browser.navigation.type': { type: 'string', value: 'bfcache' },
      });
    }
  });
});
