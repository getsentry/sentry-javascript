import type { Span } from '@sentry/core';
import { debug, getTraceData, isNodeEnv } from '@sentry/core';
import { DEBUG_BUILD } from '../utils/debug-build';
import { isCloudflareEnv } from '../utils/utils';

/** Generate a Server-Timing header value containing Sentry trace context. */
export function generateSentryServerTimingHeader(): string | null {
  if (!isNodeEnv() && !isCloudflareEnv()) {
    return null;
  }

  try {
    const traceData = getTraceData();
    const sentryTrace = traceData['sentry-trace'];
    const baggage = traceData.baggage;

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

    // Avoid duplicate entries when manually injected in entry.server.tsx
    if (existing?.includes('sentry-trace')) {
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
