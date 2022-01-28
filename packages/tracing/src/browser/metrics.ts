/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Measurements, SpanContext } from '@sentry/types';
import { browserPerformanceTimeOrigin, getGlobalObject, htmlTreeAsString, isNodeEnv, logger } from '@sentry/utils';

import { Span } from '../span';
import { Transaction } from '../transaction';
import { msToSec } from '../utils';
import { getCLS, LayoutShift } from './web-vitals/getCLS';
import { getFID } from './web-vitals/getFID';
import { getLCP, LargestContentfulPaint } from './web-vitals/getLCP';
import { getVisibilityWatcher } from './web-vitals/lib/getVisibilityWatcher';
import { NavigatorDeviceMemory, NavigatorNetworkInformation } from './web-vitals/types';

const global = getGlobalObject<Window>();

/** Class tracking metrics  */
export class MetricsInstrumentation {
  private _measurements: Measurements = {};

  private _performanceCursor: number = 0;
  private _lcpEntry: LargestContentfulPaint | undefined;
  private _clsEntry: LayoutShift | undefined;

  public constructor(private _reportAllChanges: boolean = false) {
    if (!isNodeEnv() && global && global.performance && global.document) {
      if (global.performance.mark) {
        global.performance.mark('sentry-tracing-init');
      }

      this._trackCLS();
      this._trackLCP();
      this._trackFID();
    }
  }

  /** Add performance related spans to a transaction */
  public addPerformanceEntries(transaction: Transaction): void {
    if (!global || !global.performance || !global.performance.getEntries || !browserPerformanceTimeOrigin) {
      // Gatekeeper if performance API not available
      return;
    }

    logger.log('[Tracing] Adding & adjusting spans using Performance API');

    const timeOrigin = msToSec(browserPerformanceTimeOrigin);

    let responseStartTimestamp: number | undefined;
    let requestStartTimestamp: number | undefined;

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
          case 'navigation': {
            addNavigationSpans(transaction, entry, timeOrigin);
            responseStartTimestamp = timeOrigin + msToSec(entry.responseStart as number);
            requestStartTimestamp = timeOrigin + msToSec(entry.requestStart as number);
            break;
          }
          case 'mark':
          case 'paint':
          case 'measure': {
            const startTimestamp = addMeasureSpans(transaction, entry, startTime, duration, timeOrigin);
            // capture web vitals

            const firstHidden = getVisibilityWatcher();
            // Only report if the page wasn't hidden prior to the web vital.
            const shouldRecord = entry.startTime < firstHidden.firstHiddenTime;

            if (entry.name === 'first-paint' && shouldRecord) {
              logger.log('[Measurements] Adding FP');
              this._measurements['fp'] = { value: entry.startTime };
              this._measurements['mark.fp'] = { value: startTimestamp };
            }

            if (entry.name === 'first-contentful-paint' && shouldRecord) {
              logger.log('[Measurements] Adding FCP');
              this._measurements['fcp'] = { value: entry.startTime };
              this._measurements['mark.fcp'] = { value: startTimestamp };
            }

            break;
          }
          case 'resource': {
            const resourceName = (entry.name as string).replace(global.location.origin, '');
            addResourceSpans(transaction, entry, resourceName, startTime, duration, timeOrigin);
            break;
          }
          default:
          // Ignore other entry types.
        }
      });

    this._performanceCursor = Math.max(performance.getEntries().length - 1, 0);

    this._trackNavigator(transaction);

    // Measurements are only available for pageload transactions
    if (transaction.op === 'pageload') {
      // normalize applicable web vital values to be relative to transaction.startTimestamp

      const timeOrigin = msToSec(browserPerformanceTimeOrigin);

      // Generate TTFB (Time to First Byte), which measured as the time between the beginning of the transaction and the
      // start of the response in milliseconds
      if (typeof responseStartTimestamp === 'number') {
        logger.log('[Measurements] Adding TTFB');
        this._measurements['ttfb'] = { value: (responseStartTimestamp - transaction.startTimestamp) * 1000 };

        if (typeof requestStartTimestamp === 'number' && requestStartTimestamp <= responseStartTimestamp) {
          // Capture the time spent making the request and receiving the first byte of the response.
          // This is the time between the start of the request and the start of the response in milliseconds.
          this._measurements['ttfb.requestTime'] = { value: (responseStartTimestamp - requestStartTimestamp) * 1000 };
        }
      }

      ['fcp', 'fp', 'lcp'].forEach(name => {
        if (!this._measurements[name] || timeOrigin >= transaction.startTimestamp) {
          return;
        }

        // The web vitals, fcp, fp, lcp, and ttfb, all measure relative to timeOrigin.
        // Unfortunately, timeOrigin is not captured within the transaction span data, so these web vitals will need
        // to be adjusted to be relative to transaction.startTimestamp.

        const oldValue = this._measurements[name].value;
        const measurementTimestamp = timeOrigin + msToSec(oldValue);
        // normalizedValue should be in milliseconds
        const normalizedValue = Math.abs((measurementTimestamp - transaction.startTimestamp) * 1000);

        const delta = normalizedValue - oldValue;
        logger.log(`[Measurements] Normalized ${name} from ${oldValue} to ${normalizedValue} (${delta})`);

        this._measurements[name].value = normalizedValue;
      });

      if (this._measurements['mark.fid'] && this._measurements['fid']) {
        // create span for FID

        _startChild(transaction, {
          description: 'first input delay',
          endTimestamp: this._measurements['mark.fid'].value + msToSec(this._measurements['fid'].value),
          op: 'web.vitals',
          startTimestamp: this._measurements['mark.fid'].value,
        });
      }

      // If FCP is not recorded we should not record the cls value
      // according to the new definition of CLS.
      if (!('fcp' in this._measurements)) {
        delete this._measurements.cls;
      }

      transaction.setMeasurements(this._measurements);
      tagMetricInfo(transaction, this._lcpEntry, this._clsEntry);
      transaction.setTag('sentry_reportAllChanges', this._reportAllChanges);
    }
  }

  /**
   * Capture the information of the user agent.
   */
  private _trackNavigator(transaction: Transaction): void {
    const navigator = global.navigator as null | (Navigator & NavigatorNetworkInformation & NavigatorDeviceMemory);
    if (!navigator) {
      return;
    }

    // track network connectivity
    const connection = navigator.connection;
    if (connection) {
      if (connection.effectiveType) {
        transaction.setTag('effectiveConnectionType', connection.effectiveType);
      }

      if (connection.type) {
        transaction.setTag('connectionType', connection.type);
      }

      if (isMeasurementValue(connection.rtt)) {
        this._measurements['connection.rtt'] = { value: connection.rtt as number };
      }

      if (isMeasurementValue(connection.downlink)) {
        this._measurements['connection.downlink'] = { value: connection.downlink as number };
      }
    }

    if (isMeasurementValue(navigator.deviceMemory)) {
      transaction.setTag('deviceMemory', String(navigator.deviceMemory));
    }

    if (isMeasurementValue(navigator.hardwareConcurrency)) {
      transaction.setTag('hardwareConcurrency', String(navigator.hardwareConcurrency));
    }
  }

  /** Starts tracking the Cumulative Layout Shift on the current page. */
  private _trackCLS(): void {
    // See:
    // https://web.dev/evolving-cls/
    // https://web.dev/cls-web-tooling/
    getCLS(metric => {
      const entry = metric.entries.pop();
      if (!entry) {
        return;
      }

      logger.log('[Measurements] Adding CLS');
      this._measurements['cls'] = { value: metric.value };
      this._clsEntry = entry as LayoutShift;
    });
  }

  /** Starts tracking the Largest Contentful Paint on the current page. */
  private _trackLCP(): void {
    getLCP(metric => {
      const entry = metric.entries.pop();
      if (!entry) {
        return;
      }

      const timeOrigin = msToSec(browserPerformanceTimeOrigin as number);
      const startTime = msToSec(entry.startTime as number);
      logger.log('[Measurements] Adding LCP');
      this._measurements['lcp'] = { value: metric.value };
      this._measurements['mark.lcp'] = { value: timeOrigin + startTime };
      this._lcpEntry = entry as LargestContentfulPaint;
    }, this._reportAllChanges);
  }

  /** Starts tracking the First Input Delay on the current page. */
  private _trackFID(): void {
    getFID(metric => {
      const entry = metric.entries.pop();
      if (!entry) {
        return;
      }

      const timeOrigin = msToSec(browserPerformanceTimeOrigin as number);
      const startTime = msToSec(entry.startTime as number);
      logger.log('[Measurements] Adding FID');
      this._measurements['fid'] = { value: metric.value };
      this._measurements['mark.fid'] = { value: timeOrigin + startTime };
    });
  }
}

/** Instrument navigation entries */
function addNavigationSpans(transaction: Transaction, entry: Record<string, any>, timeOrigin: number): void {
  ['unloadEvent', 'redirect', 'domContentLoadedEvent', 'loadEvent', 'connect'].forEach(event => {
    addPerformanceNavigationTiming(transaction, entry, event, timeOrigin);
  });
  addPerformanceNavigationTiming(transaction, entry, 'secureConnection', timeOrigin, 'TLS/SSL', 'connectEnd');
  addPerformanceNavigationTiming(transaction, entry, 'fetch', timeOrigin, 'cache', 'domainLookupStart');
  addPerformanceNavigationTiming(transaction, entry, 'domainLookup', timeOrigin, 'DNS');
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

export interface ResourceEntry extends Record<string, unknown> {
  initiatorType?: string;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
}

/** Create resource-related spans */
export function addResourceSpans(
  transaction: Transaction,
  entry: ResourceEntry,
  resourceName: string,
  startTime: number,
  duration: number,
  timeOrigin: number,
): void {
  // we already instrument based on fetch and xhr, so we don't need to
  // duplicate spans here.
  if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
    return;
  }

  const data: Record<string, any> = {};
  if ('transferSize' in entry) {
    data['Transfer Size'] = entry.transferSize;
  }
  if ('encodedBodySize' in entry) {
    data['Encoded Body Size'] = entry.encodedBodySize;
  }
  if ('decodedBodySize' in entry) {
    data['Decoded Body Size'] = entry.decodedBodySize;
  }

  const startTimestamp = timeOrigin + startTime;
  const endTimestamp = startTimestamp + duration;

  _startChild(transaction, {
    description: resourceName,
    endTimestamp,
    op: entry.initiatorType ? `resource.${entry.initiatorType}` : 'resource',
    startTimestamp,
    data,
  });
}

/** Create performance navigation related spans */
function addPerformanceNavigationTiming(
  transaction: Transaction,
  entry: Record<string, any>,
  event: string,
  timeOrigin: number,
  description?: string,
  eventEnd?: string,
): void {
  const end = eventEnd ? (entry[eventEnd] as number | undefined) : (entry[`${event}End`] as number | undefined);
  const start = entry[`${event}Start`] as number | undefined;
  if (!start || !end) {
    return;
  }
  _startChild(transaction, {
    op: 'browser',
    description: description ?? event,
    startTimestamp: timeOrigin + msToSec(start),
    endTimestamp: timeOrigin + msToSec(end),
  });
}

/** Create request and response related spans */
function addRequest(transaction: Transaction, entry: Record<string, any>, timeOrigin: number): void {
  _startChild(transaction, {
    op: 'browser',
    description: 'request',
    startTimestamp: timeOrigin + msToSec(entry.requestStart as number),
    endTimestamp: timeOrigin + msToSec(entry.responseEnd as number),
  });

  _startChild(transaction, {
    op: 'browser',
    description: 'response',
    startTimestamp: timeOrigin + msToSec(entry.responseStart as number),
    endTimestamp: timeOrigin + msToSec(entry.responseEnd as number),
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

/**
 * Checks if a given value is a valid measurement value.
 */
function isMeasurementValue(value: any): boolean {
  return typeof value === 'number' && isFinite(value);
}

/** Add LCP / CLS data to transaction to allow debugging */
function tagMetricInfo(
  transaction: Transaction,
  lcpEntry: MetricsInstrumentation['_lcpEntry'],
  clsEntry: MetricsInstrumentation['_clsEntry'],
): void {
  if (lcpEntry) {
    logger.log('[Measurements] Adding LCP Data');

    // Capture Properties of the LCP element that contributes to the LCP.

    if (lcpEntry.element) {
      transaction.setTag('lcp.element', htmlTreeAsString(lcpEntry.element));
    }

    if (lcpEntry.id) {
      transaction.setTag('lcp.id', lcpEntry.id);
    }

    if (lcpEntry.url) {
      // Trim URL to the first 200 characters.
      transaction.setTag('lcp.url', lcpEntry.url.trim().slice(0, 200));
    }

    transaction.setTag('lcp.size', lcpEntry.size);
  }

  // See: https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift
  if (clsEntry && clsEntry.sources) {
    logger.log('[Measurements] Adding CLS Data');
    clsEntry.sources.forEach((source, index) =>
      transaction.setTag(`cls.source.${index + 1}`, htmlTreeAsString(source.node)),
    );
  }
}
