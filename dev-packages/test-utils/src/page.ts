import type { Page } from '@playwright/test';

/**
 * Hides the page so the SDK reports the web vitals that are only finalized on pagehide.
 */
export async function hidePage(page: Page): Promise<void> {
  // web-vitals processes an interaction's event entries in `requestIdleCallback(..., { timeout:
  // 1000 })`, and Chromium only reaches idle here once that timeout elapses. Hiding before that
  // callback runs loses the interaction: the forced report web-vitals does on `visibilitychange`
  // runs ahead of it, while the callback itself reports unforced, so INP is never emitted at all.
  //
  // Idle callbacks run in scheduling order, but web-vitals only schedules its callback once the
  // Event Timing entry reaches its observer, which is after the click. Queuing one right away
  // therefore queues it first and hides the page too early. Waiting for the entry and queuing from
  // a task after it keeps web-vitals ahead: its observer is registered first, so it is notified
  // first, and the `setTimeout` lands after the microtask it defers that work into.
  /* oxlint-disable no-restricted-globals */
  await page.evaluate(() => {
    return new Promise<void>(resolve => {
      const scheduleIdle = (): void => {
        if (typeof requestIdleCallback !== 'function') {
          resolve();
          return;
        }
        requestIdleCallback(() => resolve(), { timeout: 1000 });
      };

      // Callers that never interacted have no Event Timing entry coming, so there is nothing to
      // order against and nothing to wait for.
      const interactionCount = (performance as Performance & { interactionCount?: number }).interactionCount ?? 0;
      if (!interactionCount && !performance.getEntriesByType('first-input').length) {
        scheduleIdle();
        return;
      }

      let observer: PerformanceObserver | undefined;
      let fallback: ReturnType<typeof setTimeout>;

      // An interaction the Event Timing buffer no longer reports would otherwise wait here forever,
      // so cap the wait rather than require an entry.
      const done = (): void => {
        clearTimeout(fallback);
        observer?.disconnect();
        setTimeout(scheduleIdle, 0);
      };

      fallback = setTimeout(done, 1000);

      try {
        // `durationThreshold` is missing from the DOM types, as it is in the SDK's own observer.
        const eventOptions: PerformanceObserverInit & { durationThreshold?: number } = {
          type: 'event',
          buffered: true,
          durationThreshold: 0,
        };

        observer = new PerformanceObserver(done);
        observer.observe(eventOptions);
        observer.observe({ type: 'first-input', buffered: true });
      } catch {
        done();
      }
    });
  });

  // The callback below runs in the page, so `document` is the browser's, not Node's.
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
