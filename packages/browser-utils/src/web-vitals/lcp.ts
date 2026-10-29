import type { SpanAttributes } from '@sentry/core';
import {
  BROWSER_WEB_VITAL_LCP_ELEMENT_RENDER_DELAY,
  BROWSER_WEB_VITAL_LCP_RESOURCE_LOAD_DELAY,
  BROWSER_WEB_VITAL_LCP_RESOURCE_LOAD_DURATION,
} from '@sentry/conventions/attributes';
import { WINDOW } from '../types';
import type { LargestContentfulPaint } from './emitSpan';
import { getNavigationEntry } from './utils';

/**
 * 60 seconds is the maximum for a plausible LCP value.
 */
export const MAX_PLAUSIBLE_LCP_DURATION = 60_000;

export function isValidLcpMetric(lcpValue: number | undefined): lcpValue is number {
  return lcpValue != null && lcpValue > 0 && lcpValue <= MAX_PLAUSIBLE_LCP_DURATION;
}

/**
 * The LCP subparts that follow TTFB, which together with TTFB add up to the LCP value.
 *
 * Only meaningful for the navigation that loaded the document, since soft navigations and bfcache
 * restores have no TTFB to split from. Returns nothing when the LCP image has no resource timing
 * entry (e.g. the buffer was full), because guessing would report a load delay that never happened.
 */
export function getLcpSubpartAttributes(lcpValue: number, entry: LargestContentfulPaint): SpanAttributes | undefined {
  const navigationEntry = getNavigationEntry();
  if (!navigationEntry) {
    return undefined;
  }

  const activationStart = navigationEntry.activationStart || 0;
  const ttfb = Math.max(navigationEntry.responseStart - activationStart, 0);
  if (ttfb > lcpValue) {
    return undefined;
  }

  let requestStart = ttfb;
  let responseEnd = ttfb;

  // Text and inline (data:, blob:) images aren't fetched, so all time after TTFB is render delay.
  if (/^https?:/.test(entry.url)) {
    const resourceEntry = WINDOW.performance.getEntriesByType('resource').find(resource => resource.name === entry.url);
    if (!resourceEntry) {
      return undefined;
    }

    // `requestStart` is 0 for cross-origin resources without `Timing-Allow-Origin`.
    const resourceRequestStart = (resourceEntry.requestStart || resourceEntry.startTime) - activationStart;
    requestStart = Math.min(Math.max(resourceRequestStart, ttfb), lcpValue);
    responseEnd = Math.min(Math.max(resourceEntry.responseEnd - activationStart, requestStart), lcpValue);
  }

  return {
    [BROWSER_WEB_VITAL_LCP_RESOURCE_LOAD_DELAY]: requestStart - ttfb,
    [BROWSER_WEB_VITAL_LCP_RESOURCE_LOAD_DURATION]: responseEnd - requestStart,
    [BROWSER_WEB_VITAL_LCP_ELEMENT_RENDER_DELAY]: lcpValue - responseEnd,
  };
}
