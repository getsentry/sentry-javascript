import { expect, test } from '@playwright/test';
import { getSpanOp } from '@sentry-internal/test-utils';
import { setTestUser, waitForIdleSpanEnd, waitForStreamedSpan } from './helpers';

test.beforeEach(setTestUser);

test('Updates pageload span name correctly when span is cancelled early (document.hidden simulation)', async ({
  page,
}) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  // Set up the page to simulate document.hidden before navigation
  await page.addInitScript(() => {
    // Wait a bit for Sentry to initialize and start the pageload span
    setTimeout(() => {
      // Override document.hidden to simulate tab switching
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: function () {
          return true;
        },
      });

      // Dispatch visibilitychange event to trigger the idle span cancellation logic
      document.dispatchEvent(new Event('visibilitychange'));
    }, 100); // Small delay to ensure the span has started
  });

  // Navigate to the lazy route URL
  await page.goto('/lazy/inner/1/2/3');

  const event = await transactionPromise;

  // Verify the lazy route content eventually loads (even though span was cancelled early)
  const lazyRouteContent = page.locator('id=innermost-lazy-route');
  await expect(lazyRouteContent).toBeVisible();

  // Validate that the transaction event has the correct parameterized route name
  // even though the span was cancelled early due to document.hidden
  expect(event.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');

  // Check if the span was indeed cancelled (should have idle_span_finish_reason attribute)
  const idleSpanFinishReason = event.attributes['sentry.idle_span_finish_reason']?.value;
  if (idleSpanFinishReason) {
    // If the span was cancelled due to visibility change, verify it still got the right name
    expect(['externalFinish', 'cancelled']).toContain(idleSpanFinishReason);
  }
});

test('Updates navigation span name correctly when span is cancelled early (document.hidden simulation)', async ({
  page,
}) => {
  await page.goto('/?idleTimeout=5000');

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return (
      getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/lazy/inner/:id/:anotherId/:someAnotherId'
    );
  });

  await page.locator('id=navigation').click();
  await page.waitForFunction(() => (window as unknown as TestWindow).__SENTRY_ACTIVE_SPAN_OP__() === 'navigation');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const event = await navigationPromise;
  await expect(page.locator('id=innermost-lazy-route')).toBeVisible();

  expect(event.name).toBe('/lazy/inner/:id/:anotherId/:someAnotherId');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');
  expect(event.attributes['sentry.cancellation_reason']?.value).toBe('document.hidden');
  expect(event.attributes['sentry.idle_span_finish_reason']?.value).toBe('externalFinish');
});

// Regression: Pageload to slow lazy route should get parameterized name even if span ends early
test('Slow lazy route pageload with early span end still gets parameterized route name (regression)', async ({
  page,
}) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.startsWith('/slow-fetch');
  });

  // idleTimeout=300 ends span before 500ms lazy route loads, timeout=1000 waits for lazy routes
  await page.goto('/slow-fetch/123?idleTimeout=300&timeout=1000');

  const event = await transactionPromise;

  expect(event.name).toBe('/slow-fetch/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');

  const idleSpanFinishReason = event.attributes['sentry.idle_span_finish_reason']?.value;
  expect(['idleTimeout', 'externalFinish']).toContain(idleSpanFinishReason);
});

// Regression: Wildcard route names should be upgraded to parameterized routes when lazy routes load
test('Wildcard route pageload gets upgraded to parameterized route name (regression)', async ({ page }) => {
  const transactionPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  await page.goto('/wildcard-lazy/456?idleTimeout=300&timeout=1000');

  const event = await transactionPromise;

  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

// Regression: Navigation to slow lazy route should get parameterized name even if span ends early.
// Network activity from dynamic imports extends the idle timeout until lazy routes load.
test('Slow lazy route navigation with early span end still gets parameterized route name (regression)', async ({
  page,
}) => {
  // Configure short idle timeout (300ms) but longer lazy route timeout (1000ms)
  await page.goto('/?idleTimeout=300&timeout=1000');

  // Wait for pageload to complete
  await waitForIdleSpanEnd(page);

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  // Navigate to wildcard-lazy route (500ms delay in module via top-level await)
  // The dynamic import creates network activity that extends the span lifetime
  const wildcardLazyLink = page.locator('id=navigation-to-wildcard-lazy');
  await expect(wildcardLazyLink).toBeVisible();
  await wildcardLazyLink.click();

  const event = await navigationPromise;

  // The navigation transaction should have the parameterized route name
  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

// lazyRouteManifest: provides parameterized name when lazy routes don't resolve in time
test('Route manifest provides correct name when navigation span ends before lazy route resolves', async ({ page }) => {
  // Short idle timeout (50ms) ensures span ends before lazy route (500ms) resolves
  await page.goto('/?idleTimeout=50&timeout=0');

  // Wait for pageload to complete
  await waitForIdleSpanEnd(page);

  const navigationPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  // Navigate to wildcard-lazy route (500ms delay in module via top-level await)
  const wildcardLazyLink = page.locator('id=navigation-to-wildcard-lazy');
  await expect(wildcardLazyLink).toBeVisible();
  await wildcardLazyLink.click();

  const event = await navigationPromise;

  // Should have parameterized name from manifest, not wildcard (/wildcard-lazy/*)
  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('navigation');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Route manifest provides correct name when pageload span ends before lazy route resolves', async ({ page }) => {
  // Short idle timeout (50ms) ensures span ends before lazy route (500ms) resolves
  const pageloadPromise = waitForStreamedSpan('react-router-7-lazy-routes', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name.startsWith('/wildcard-lazy');
  });

  await page.goto('/wildcard-lazy/123?idleTimeout=50&timeout=0');

  const event = await pageloadPromise;

  // Should have parameterized name from manifest, not wildcard (/wildcard-lazy/*)
  expect(event.name).toBe('/wildcard-lazy/:id');
  expect(event.is_segment).toBe(true);
  expect(getSpanOp(event)).toBe('pageload');
  expect(event.attributes['sentry.segment.name.source']?.value).toBe('route');
});
