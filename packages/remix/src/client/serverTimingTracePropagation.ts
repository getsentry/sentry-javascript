import { debug, extractTraceparentData } from '@sentry/core';
import { WINDOW } from '@sentry/react';
import { DEBUG_BUILD } from '../utils/debug-build';

export interface ServerTimingTraceContext {
  sentryTrace: string;
  baggage: string;
}

type NavigationTraceResult =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'available'; data: ServerTimingTraceContext };

// Cache for navigation trace to avoid repeated parsing
let navigationTraceCache: ServerTimingTraceContext | null | undefined;

// 40 attempts × 50ms = 2 seconds max wait for Performance API to process navigation entries
// Aligned with react-router's hydration polling pattern (see hydratedRouter.ts)
const MAX_RETRY_ATTEMPTS = 40;
const RETRY_INTERVAL_MS = 50;

/**
 * Check if Server-Timing API is supported in the current browser.
 */
export function isServerTimingSupported(): boolean {
  if (typeof WINDOW === 'undefined' || !WINDOW.performance) {
    return false;
  }

  try {
    const navEntries = WINDOW.performance.getEntriesByType?.('navigation');
    if (!navEntries || navEntries.length === 0) {
      return false;
    }

    const firstEntry = navEntries[0];
    if (!firstEntry) {
      return false;
    }

    return 'serverTiming' in firstEntry;
  } catch {
    return false;
  }
}

function parseServerTimingTrace(serverTiming: readonly PerformanceServerTiming[]): ServerTimingTraceContext | null {
  let sentryTrace = '';
  let baggage = '';

  for (const entry of serverTiming) {
    if (entry.name === 'sentry-trace') {
      sentryTrace = entry.description;
    } else if (entry.name === 'baggage') {
      try {
        // Baggage is URL-encoded in Server-Timing header
        baggage = decodeURIComponent(entry.description);
      } catch {
        baggage = entry.description;
      }
    }
  }

  if (!sentryTrace) {
    return null;
  }

  const traceparentData = extractTraceparentData(sentryTrace);
  if (!traceparentData?.traceId || !traceparentData?.parentSpanId) {
    DEBUG_BUILD && debug.warn('[Server-Timing] Invalid sentry-trace format:', sentryTrace);
    return null;
  }

  return { sentryTrace, baggage };
}

function tryGetNavigationTraceContext(): NavigationTraceResult {
  try {
    const navEntries = WINDOW.performance.getEntriesByType('navigation');

    if (!navEntries || navEntries.length === 0) {
      return { status: 'unavailable' };
    }

    const navEntry = navEntries[0] as PerformanceNavigationTiming;

    // responseStart === 0 means headers haven't been processed yet
    if (navEntry.responseStart === 0) {
      return { status: 'pending' };
    }

    const serverTiming = navEntry.serverTiming;

    if (!serverTiming || serverTiming.length === 0) {
      return { status: 'unavailable' };
    }

    const result = parseServerTimingTrace(serverTiming);

    return result ? { status: 'available', data: result } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Get trace context from the initial navigation (page load).
 * Reads the Server-Timing header from the navigation performance entry.
 * Results are cached after first successful retrieval.
 */
export function getNavigationTraceContext(): ServerTimingTraceContext | null {
  if (navigationTraceCache !== undefined) {
    return navigationTraceCache;
  }

  if (!isServerTimingSupported()) {
    DEBUG_BUILD && debug.log('[Server-Timing] Server-Timing API not supported');
    navigationTraceCache = null;
    return null;
  }

  const result = tryGetNavigationTraceContext();

  switch (result.status) {
    case 'unavailable':
      navigationTraceCache = null;
      return null;
    case 'pending':
      return null;
    case 'available':
      navigationTraceCache = result.data;
      return result.data;
  }
}

/**
 * Get trace context from navigation with retry mechanism.
 * Useful during SDK init when browser may not have finished processing headers.
 */
export function getNavigationTraceContextAsync(
  callback: (trace: ServerTimingTraceContext | null) => void,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  delayMs: number = RETRY_INTERVAL_MS,
): void {
  if (navigationTraceCache !== undefined) {
    callback(navigationTraceCache);
    return;
  }

  if (!isServerTimingSupported()) {
    DEBUG_BUILD && debug.log('[Server-Timing] Server-Timing API not supported');
    navigationTraceCache = null;
    callback(null);
    return;
  }

  let attempts = 0;

  const tryGet = (): void => {
    attempts++;
    const result = tryGetNavigationTraceContext();

    switch (result.status) {
      case 'unavailable':
        navigationTraceCache = null;
        callback(null);
        return;
      case 'pending':
        if (attempts < maxAttempts) {
          setTimeout(tryGet, delayMs);
          return;
        }
        DEBUG_BUILD && debug.log('[Server-Timing] Max retry attempts reached');
        navigationTraceCache = null;
        callback(null);
        return;
      case 'available':
        navigationTraceCache = result.data;
        callback(result.data);
    }
  };

  tryGet();
}

/**
 * Get trace context from meta tags (fallback for older browsers).
 * Looks for `<meta name="sentry-trace">` and `<meta name="baggage">` tags.
 */
export function getMetaTagTraceContext(): ServerTimingTraceContext | null {
  if (typeof WINDOW === 'undefined' || !WINDOW.document) {
    return null;
  }

  try {
    const sentryTraceMeta = WINDOW.document.querySelector<HTMLMetaElement>('meta[name="sentry-trace"]');
    const baggageMeta = WINDOW.document.querySelector<HTMLMetaElement>('meta[name="baggage"]');

    const sentryTrace = sentryTraceMeta?.content;

    if (!sentryTrace) {
      return null;
    }

    const traceparentData = extractTraceparentData(sentryTrace);
    if (!traceparentData?.traceId || !traceparentData?.parentSpanId) {
      DEBUG_BUILD && debug.warn('[Server-Timing] Invalid sentry-trace format in meta tag:', sentryTrace);
      return null;
    }

    return {
      sentryTrace,
      baggage: baggageMeta?.content || '',
    };
  } catch {
    return null;
  }
}

/** @internal */
export function clearNavigationTraceCache(): void {
  navigationTraceCache = undefined;
}
