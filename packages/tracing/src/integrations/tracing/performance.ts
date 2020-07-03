import { getGlobalObject } from '@sentry/utils';

import { Span } from '../../span';
import { Transaction } from '../../transaction';
import { BrowserTracing } from '../browsertracing';

import { msToSec } from './utils';

const global = getGlobalObject<Window>();

/**
 * Adds metrics to transactions.
 */
// tslint:disable-next-line: no-unnecessary-class
export class Metrics {
  private static _lcp: Record<string, any>;

  private static _performanceCursor: number = 0;

  private static _forceLCP = () => {
    /* No-op, replaced later if LCP API is available. */
    return;
  };

  /**
   * Starts tracking the Largest Contentful Paint on the current page.
   */
  private static _trackLCP(): void {
    // Based on reference implementation from https://web.dev/lcp/#measure-lcp-in-javascript.

    // Use a try/catch instead of feature detecting `largest-contentful-paint`
    // support, since some browsers throw when using the new `type` option.
    // https://bugs.webkit.org/show_bug.cgi?id=209216
    try {
      // Keep track of whether (and when) the page was first hidden, see:
      // https://github.com/w3c/page-visibility/issues/29
      // NOTE: ideally this check would be performed in the document <head>
      // to avoid cases where the visibility state changes before this code runs.
      let firstHiddenTime = document.visibilityState === 'hidden' ? 0 : Infinity;
      document.addEventListener(
        'visibilitychange',
        event => {
          firstHiddenTime = Math.min(firstHiddenTime, event.timeStamp);
        },
        { once: true },
      );

      const updateLCP = (entry: PerformanceEntry) => {
        // Only include an LCP entry if the page wasn't hidden prior to
        // the entry being dispatched. This typically happens when a page is
        // loaded in a background tab.
        if (entry.startTime < firstHiddenTime) {
          // NOTE: the `startTime` value is a getter that returns the entry's
          // `renderTime` value, if available, or its `loadTime` value otherwise.
          // The `renderTime` value may not be available if the element is an image
          // that's loaded cross-origin without the `Timing-Allow-Origin` header.
          Metrics._lcp = {
            // @ts-ignore
            ...(entry.id && { elementId: entry.id }),
            // @ts-ignore
            ...(entry.size && { elementSize: entry.size }),
            value: entry.startTime,
          };
        }
      };

      // Create a PerformanceObserver that calls `updateLCP` for each entry.
      const po = new PerformanceObserver(entryList => {
        entryList.getEntries().forEach(updateLCP);
      });

      // Observe entries of type `largest-contentful-paint`, including buffered entries,
      // i.e. entries that occurred before calling `observe()` below.
      po.observe({
        buffered: true,
        // @ts-ignore
        type: 'largest-contentful-paint',
      });

      Metrics._forceLCP = () => {
        po.takeRecords().forEach(updateLCP);
      };
    } catch (e) {
      // Do nothing if the browser doesn't support this API.
    }
  }

  /**
   * Start tracking metrics
   */
  public static init(): void {
    if (global.performance) {
      if (global.performance.mark) {
        global.performance.mark('sentry-tracing-init');
      }
      Metrics._trackLCP();
    }
  }

  /**
   * Adds performance related spans to a transaction
   */
  public static addPerformanceEntries(transaction: Transaction): void {
    if (!global.performance || !global.performance.getEntries) {
      // Gatekeeper if performance API not available
      return;
    }

    BrowserTracing.log('[Tracing] Adding & adjusting spans using Performance API');
    // FIXME: depending on the 'op' directly is brittle.
    if (transaction.op === 'pageload') {
      // Force any pending records to be dispatched.
      Metrics._forceLCP();
      if (Metrics._lcp) {
        // Set the last observed LCP score.
        transaction.setData('_sentry_web_vitals', { LCP: Metrics._lcp });
      }
    }

    const timeOrigin = msToSec(performance.timeOrigin);

    let entryScriptSrc: string | undefined;

    if (global.document) {
      // tslint:disable-next-line: prefer-for-of
      for (let i = 0; i < document.scripts.length; i++) {
        // We go through all scripts on the page and look for 'data-entry'
        // We remember the name and measure the time between this script finished loading and
        // our mark 'sentry-tracing-init'
        if (document.scripts[i].dataset.entry === 'true') {
          entryScriptSrc = document.scripts[i].src;
          break;
        }
      }
    }

    let entryScriptStartEndTime: number | undefined;
    let tracingInitMarkStartTime: number | undefined;

    // tslint:disable-next-line: completed-docs
    function addPerformanceNavigationTiming(parent: Span, entry: Record<string, number>, event: string): void {
      parent.startChild({
        description: event,
        endTimestamp: timeOrigin + msToSec(entry[`${event}End`]),
        op: 'browser',
        startTimestamp: timeOrigin + msToSec(entry[`${event}Start`]),
      });
    }

    // tslint:disable-next-line: completed-docs
    function addRequest(parent: Span, entry: Record<string, number>): void {
      parent.startChild({
        description: 'request',
        endTimestamp: timeOrigin + msToSec(entry.responseEnd),
        op: 'browser',
        startTimestamp: timeOrigin + msToSec(entry.requestStart),
      });

      parent.startChild({
        description: 'response',
        endTimestamp: timeOrigin + msToSec(entry.responseEnd),
        op: 'browser',
        startTimestamp: timeOrigin + msToSec(entry.responseStart),
      });
    }

    // tslint:disable: no-unsafe-any
    performance
      .getEntries()
      .slice(Metrics._performanceCursor)
      .forEach((entry: any) => {
        const startTime = msToSec(entry.startTime as number);
        const duration = msToSec(entry.duration as number);

        if (transaction.op === 'navigation' && timeOrigin + startTime < transaction.startTimestamp) {
          return;
        }

        switch (entry.entryType) {
          case 'navigation':
            addPerformanceNavigationTiming(transaction, entry, 'unloadEvent');
            addPerformanceNavigationTiming(transaction, entry, 'domContentLoadedEvent');
            addPerformanceNavigationTiming(transaction, entry, 'loadEvent');
            addPerformanceNavigationTiming(transaction, entry, 'connect');
            addPerformanceNavigationTiming(transaction, entry, 'domainLookup');
            addRequest(transaction, entry);
            break;
          case 'mark':
          case 'paint':
          case 'measure':
            const measureStartTimestamp = timeOrigin + startTime;
            const measureEndTimestamp = measureStartTimestamp + duration;

            if (tracingInitMarkStartTime === undefined && entry.name === 'sentry-tracing-init') {
              tracingInitMarkStartTime = measureStartTimestamp;
            }

            transaction.startChild({
              description: entry.name,
              endTimestamp: measureEndTimestamp,
              op: entry.entryType,
              startTimestamp: measureStartTimestamp,
            });
            break;
          case 'resource':
            const resourceName = entry.name.replace(window.location.origin, '');
            if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
              // We need to update existing spans with new timing info
              if (transaction.spanRecorder) {
                transaction.spanRecorder.spans.map((finishedSpan: Span) => {
                  if (finishedSpan.description && finishedSpan.description.indexOf(resourceName) !== -1) {
                    finishedSpan.startTimestamp = timeOrigin + startTime;
                    finishedSpan.endTimestamp = finishedSpan.startTimestamp + duration;
                  }
                });
              }
            } else {
              const startTimestamp = timeOrigin + startTime;
              const endTimestamp = startTimestamp + duration;

              // We remember the entry script end time to calculate the difference to the first init mark
              if (entryScriptStartEndTime === undefined && (entryScriptSrc || '').indexOf(resourceName) > -1) {
                entryScriptStartEndTime = endTimestamp;
              }

              transaction.startChild({
                description: `${entry.initiatorType} ${resourceName}`,
                endTimestamp,
                op: `resource`,
                startTimestamp,
              });
            }
            break;
          default:
          // Ignore other entry types.
        }
      });
    if (entryScriptStartEndTime !== undefined && tracingInitMarkStartTime !== undefined) {
      transaction.startChild({
        description: 'evaluation',
        endTimestamp: tracingInitMarkStartTime,
        op: `script`,
        startTimestamp: entryScriptStartEndTime,
      });
    }

    Metrics._performanceCursor = Math.max(performance.getEntries().length - 1, 0);

    // tslint:enable: no-unsafe-any
  }
}
