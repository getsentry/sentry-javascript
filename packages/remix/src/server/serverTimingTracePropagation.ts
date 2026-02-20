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
import { isCloudflareEnv } from '../utils/utils';

/** Generate a Server-Timing header value containing Sentry trace context. */
export function generateSentryServerTimingHeader(span?: Span): string | null {
  if (!isNodeEnv() && !isCloudflareEnv()) {
    return null;
  }

  try {
    let resolvedSpan = span;
    if (!resolvedSpan) {
      const activeSpan = getActiveSpan();
      if (activeSpan) {
        resolvedSpan = getRootSpan(activeSpan);
      }
    }

    let sentryTrace: string | undefined;
    let baggage: string | undefined;

    if (resolvedSpan) {
      sentryTrace = spanToTraceHeader(resolvedSpan);
      baggage = spanToBaggageHeader(resolvedSpan);
    } else {
      const traceData = getTraceData();
      sentryTrace = traceData['sentry-trace'];
      baggage = traceData.baggage;
    }

    if (!sentryTrace) {
      return null;
    }

    const parts: string[] = [];

    parts.push(`sentry-trace;desc="${sentryTrace}"`);

    if (baggage) {
      parts.push(`baggage;desc="${baggage}"`);
    }

    return parts.join(', ');
  } catch (e) {
    DEBUG_BUILD && debug.warn('Failed to generate Server-Timing header', e);
    return null;
  }
}

/** @internal */
export function injectServerTimingHeaderValue(response: Response, serverTimingValue: string): Response {
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
