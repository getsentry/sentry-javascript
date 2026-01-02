import type { Span } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  getTraceData,
  isNodeEnv,
  spanToTraceHeader,
} from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';

// Sentry baggage key prefix
const SENTRY_BAGGAGE_KEY_PREFIX = 'sentry-';

export interface ServerTimingTraceOptions {
  /** Include baggage in Server-Timing header. @default true */
  includeBaggage?: boolean;
  /** Explicitly pass a span to use for trace data. */
  span?: Span;
}

const DEFAULT_OPTIONS: Required<Omit<ServerTimingTraceOptions, 'span'>> = {
  includeBaggage: true,
};

/**
 * Check if running in Cloudflare Workers environment.
 */
export function isCloudflareEnv(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof navigator !== 'undefined' && navigator?.userAgent?.includes('Cloudflare');
}

/**
 * Generate Server-Timing header value containing Sentry trace context.
 * Enables trace propagation from server to client via the Performance API.
 */
export function generateSentryServerTimingHeader(options: ServerTimingTraceOptions = {}): string | null {
  // Only generate on server environments
  if (!isNodeEnv() && !isCloudflareEnv()) {
    return null;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  let span = opts.span;
  if (!span) {
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      span = getRootSpan(activeSpan);
    }
  }

  let sentryTrace: string | undefined;
  let baggage: string | undefined;

  if (span) {
    sentryTrace = spanToTraceHeader(span);
    const spanTraceId = span.spanContext().traceId;

    // Get DSC from span and ensure trace_id consistency
    const dsc = getDynamicSamplingContextFromSpan(span);

    // Build baggage string, ensuring trace_id matches the span's trace_id
    // The DSC may have a different trace_id if it was frozen from an earlier context
    const baggageEntries: string[] = [];
    for (const [key, value] of Object.entries(dsc)) {
      if (value) {
        // Override trace_id to match the span's trace_id for consistency
        const actualValue = key === 'trace_id' ? spanTraceId : value;
        baggageEntries.push(`${SENTRY_BAGGAGE_KEY_PREFIX}${key}=${actualValue}`);
      }
    }
    baggage = baggageEntries.length > 0 ? baggageEntries.join(',') : undefined;
  } else {
    const traceData = getTraceData();
    sentryTrace = traceData['sentry-trace'];
    baggage = traceData.baggage;
  }

  if (!sentryTrace) {
    return null;
  }

  const metrics: string[] = [];

  metrics.push(`sentry-trace;desc="${sentryTrace}"`);

  if (opts.includeBaggage && baggage) {
    // URL-encode baggage to handle special characters
    metrics.push(`baggage;desc="${encodeURIComponent(baggage)}"`);
  }

  return metrics.join(', ');
}

/**
 * Merge Sentry Server-Timing with an existing Server-Timing header value.
 */
export function mergeSentryServerTimingHeader(
  existingHeader: string | null | undefined,
  options?: ServerTimingTraceOptions,
): string {
  const sentryTiming = generateSentryServerTimingHeader(options);

  if (!sentryTiming) {
    return existingHeader || '';
  }

  if (!existingHeader) {
    return sentryTiming;
  }

  return `${existingHeader}, ${sentryTiming}`;
}

/**
 * Inject a precomputed Server-Timing header value into a Response.
 * Returns a new Response with the header added.
 * @internal
 */
export function injectServerTimingHeaderValue(response: Response, serverTimingValue: string): Response {
  if (response.bodyUsed) {
    DEBUG_BUILD && debug.warn('Cannot add Server-Timing header: response body already consumed');
    return response;
  }

  try {
    const headers = new Headers(response.headers);
    const existing = headers.get('Server-Timing');

    headers.set('Server-Timing', existing ? `${existing}, ${serverTimingValue}` : serverTimingValue);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (e) {
    DEBUG_BUILD && debug.warn('Failed to add Server-Timing header to response', e);
    return response;
  }
}

/**
 * Add Sentry trace context to Response headers via Server-Timing.
 * Returns a new Response with the header added.
 */
export function addSentryServerTimingHeader(response: Response, options?: ServerTimingTraceOptions): Response {
  const sentryTiming = generateSentryServerTimingHeader(options);

  if (!sentryTiming) {
    return response;
  }

  return injectServerTimingHeaderValue(response, sentryTiming);
}
