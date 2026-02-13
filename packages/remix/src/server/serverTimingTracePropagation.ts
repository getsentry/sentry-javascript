import type { Span } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getRootSpan,
  getTraceData,
  isNodeEnv,
  spanToBaggageHeader,
  spanToTraceHeader,
} from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';

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
 * Generate a Server-Timing header value containing Sentry trace context.
 * Called automatically by instrumented `handleDocumentRequest`.
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
    baggage = spanToBaggageHeader(span);
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
    // Escape special characters for use inside a quoted-string (RFC 7230)
    // We escape backslashes and double quotes to prevent injection
    const escapedBaggage = baggage.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    metrics.push(`baggage;desc="${escapedBaggage}"`);
  }

  return metrics.join(', ');
}

/**
 * Merge Sentry trace context with an existing Server-Timing header value.
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

    // Skip injection if Sentry trace data already exists to prevent duplicates
    if (existing?.includes('sentry-trace')) {
      DEBUG_BUILD && debug.log('Server-Timing header already contains sentry-trace, skipping injection');
      return response;
    }

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
 * Add Sentry trace context to a Response via the Server-Timing header.
 * Returns a new Response with the header added (original is not modified).
 */
export function addSentryServerTimingHeader(response: Response, options?: ServerTimingTraceOptions): Response {
  const sentryTiming = generateSentryServerTimingHeader(options);

  if (!sentryTiming) {
    return response;
  }

  return injectServerTimingHeaderValue(response, sentryTiming);
}
