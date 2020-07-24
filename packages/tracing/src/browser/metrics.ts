import { SpanContext } from '@sentry/types';
import { getGlobalObject, logger } from '@sentry/utils';

import { Span } from '../span';
import { Transaction } from '../transaction';

import { msToSec } from './utils';

const global = getGlobalObject<Window>();

/** Class tracking metrics  */
export class MetricsInstrumentation {
  private _lcp: Record<string, any> = {};

  private _performanceCursor: number = 0;

  private _forceLCP = () => {
    /* No-op, replaced later if LCP API is available. */
    return;
  };

  /** Starts tracking the Largest Contentful Paint on the current page. */
  private _trackLCP(): void {
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
          this._lcp = {
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

      this._forceLCP = () => {
        po.takeRecords().forEach(updateLCP);
      };
    } catch (e) {
      // Do nothing if the browser doesn't support this API.
    }
  }

  public constructor() {
    if (global && global.performance) {
      if (global.performance.mark) {
        global.performance.mark('sentry-tracing-init');
      }

      this._trackLCP();
    }
  }

  /** Add performance related spans to a transaction */
  public addPerformanceEntires(transaction: Transaction): void {
    if (!global || !global.performance || !global.performance.getEntries) {
      // Gatekeeper if performance API not available
      return;
    }

    logger.log('[Tracing] Adding & adjusting spans using Performance API');

    // TODO(fixme): depending on the 'op' directly is brittle.
    if (transaction.op === 'pageload') {
      // Force any pending records to be dispatched.
      this._forceLCP();
      if (this._lcp) {
        // Set the last observed LCP score.
        transaction.setData('_sentry_web_vitals', { LCP: this._lcp });
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

    let entryScriptStartTimestamp: number | undefined;
    let tracingInitMarkStartTime: number | undefined;

    global.performance
      .getEntries()
      .slice(this._performanceCursor)
      .forEach((entry: Record<string, any>) => {
        const startTime = msToSec(entry.startTime as number);
        const duration = msToSec(entry.duration as number);

        if (transaction.op === 'navigation' && timeOrigin + startTime < transaction.startTimestamp) {
          return;
        }

        switch (entry.entryType) {
          case 'navigation':
            addNavigationSpans(transaction, entry, timeOrigin);
            break;
          case 'mark':
          case 'paint':
          case 'measure':
            const startTimestamp = addMeasureSpans(transaction, entry, startTime, duration, timeOrigin);
            if (tracingInitMarkStartTime === undefined && entry.name === 'sentry-tracing-init') {
              tracingInitMarkStartTime = startTimestamp;
            }
            break;
          case 'resource':
            const resourceName = (entry.name as string).replace(window.location.origin, '');
            const endTimestamp = addResourceSpans(transaction, entry, resourceName, startTime, duration, timeOrigin);
            // We remember the entry script end time to calculate the difference to the first init mark
            if (entryScriptStartTimestamp === undefined && (entryScriptSrc || '').indexOf(resourceName) > -1) {
              entryScriptStartTimestamp = endTimestamp;
            }
            break;
          default:
          // Ignore other entry types.
        }
      });

    if (entryScriptStartTimestamp !== undefined && tracingInitMarkStartTime !== undefined) {
      _startChild(transaction, {
        description: 'evaluation',
        endTimestamp: tracingInitMarkStartTime,
        op: 'script',
        startTimestamp: entryScriptStartTimestamp,
      });
    }

    this._performanceCursor = Math.max(performance.getEntries().length - 1, 0);
  }
}

/** Instrument navigation entries */
function addNavigationSpans(transaction: Transaction, entry: Record<string, any>, timeOrigin: number): void {
  addPerformanceNavigationTiming(transaction, entry, 'unloadEvent', timeOrigin);
  addPerformanceNavigationTiming(transaction, entry, 'domContentLoadedEvent', timeOrigin);
  addPerformanceNavigationTiming(transaction, entry, 'loadEvent', timeOrigin);
  addPerformanceNavigationTiming(transaction, entry, 'connect', timeOrigin);
  addPerformanceNavigationTiming(transaction, entry, 'domainLookup', timeOrigin);
  addRequest(transaction, entry, timeOrigin);
}

/** Create measure related spans */
function addMeasureSpans(
  transaction: Transaction,
  entry: Record<string, any>,
  startTime: number,
  duration: number,
  timeOrigin: number,
): number {
  const measureStartTimestamp = timeOrigin + startTime;
  const measureEndTimestamp = measureStartTimestamp + duration;

  _startChild(transaction, {
    description: entry.name as string,
    endTimestamp: measureEndTimestamp,
    op: entry.entryType as string,
    startTimestamp: measureStartTimestamp,
  });

  return measureStartTimestamp;
}

/** Create resource related spans */
function addResourceSpans(
  transaction: Transaction,
  entry: Record<string, any>,
  resourceName: string,
  startTime: number,
  duration: number,
  timeOrigin: number,
): number | undefined {
  // we already instrument based on fetch and xhr, so we don't need to
  // duplicate spans here.
  if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
    return undefined;
  }

  const startTimestamp = timeOrigin + startTime;
  const endTimestamp = startTimestamp + duration;

  _startChild(transaction, {
    description: `${entry.initiatorType} ${resourceName}`,
    endTimestamp,
    op: 'resource',
    startTimestamp,
  });

  return endTimestamp;
}

/** Create performance navigation related spans */
function addPerformanceNavigationTiming(
  transaction: Transaction,
  entry: Record<string, any>,
  event: string,
  timeOrigin: number,
): void {
  const end = entry[`${event}End`] as number | undefined;
  const start = entry[`${event}Start`] as number | undefined;
  if (!start || !end) {
    return;
  }
  _startChild(transaction, {
    description: event,
    endTimestamp: timeOrigin + msToSec(end),
    op: 'browser',
    startTimestamp: timeOrigin + msToSec(start),
  });
}

/** Create request and response related spans */
function addRequest(transaction: Transaction, entry: Record<string, any>, timeOrigin: number): void {
  _startChild(transaction, {
    description: 'request',
    endTimestamp: timeOrigin + msToSec(entry.responseEnd as number),
    op: 'browser',
    startTimestamp: timeOrigin + msToSec(entry.requestStart as number),
  });

  _startChild(transaction, {
    description: 'response',
    endTimestamp: timeOrigin + msToSec(entry.responseEnd as number),
    op: 'browser',
    startTimestamp: timeOrigin + msToSec(entry.responseStart as number),
  });
}

/**
 * Helper function to start child on transactions. This function will make sure that the transaction will
 * use the start timestamp of the created child span if it is earlier than the transactions actual
 * start timestamp.
 */
export function _startChild(transaction: Transaction, { startTimestamp, ...ctx }: SpanContext): Span {
  if (startTimestamp && transaction.startTimestamp > startTimestamp) {
    transaction.startTimestamp = startTimestamp;
  }

  return transaction.startChild({
    startTimestamp,
    ...ctx,
  });
}
