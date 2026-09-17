import type { Page } from '@playwright/test';

/**
 * Hides the page so the SDK reports the web vitals that are only finalized on pagehide.
 */
export async function hidePage(page: Page): Promise<void> {
  // web-vitals defers processing an interaction's event entries into
  // `requestIdleCallback(..., { timeout: 1000 })`, and Chromium only reaches idle here once that
  // timeout elapses. Hiding the page first forces a report while the metric is still unset, so no
  // vital is emitted at all. Idle callbacks run in scheduling order, so waiting for one queued now
  // means web-vitals' earlier callback has already run.
  await page.evaluate(() => {
    return new Promise<void>(resolve => {
      if (typeof requestIdleCallback !== 'function') {
        resolve();
        return;
      }
      requestIdleCallback(() => resolve(), { timeout: 1000 });
    });
  });

  // The callback below runs in the page, so `document` is the browser's, not Node's.
  /* oxlint-disable no-restricted-globals */
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    document.dispatchEvent(new Event('visibilitychange'));
  });
  /* oxlint-enable no-restricted-globals */
}
