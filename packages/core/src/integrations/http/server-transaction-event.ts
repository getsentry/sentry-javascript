/**
 * Shared post-processing for transaction events produced by server span instrumentation.
 *
 * Node's `httpServerSpansIntegration` and Deno's `denoHttpIntegration` both create their
 * server spans outside of the OTel SDK span exporter, so neither gets the exporter's
 * status code handling for free. Both run this from their `processEvent` hook instead.
 */

import { HTTP_RESPONSE_STATUS_CODE } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build';
import type { Event } from '../../types/event';
import { debug } from '../../utils/debug-logger';

/**
 * Status codes for which server transactions are dropped unless `ignoreStatusCodes` says otherwise.
 *
 * 300 and 304 are possibly valid status codes we do not want to filter, hence the split ranges.
 */
export const DEFAULT_IGNORE_STATUS_CODES: (number | [number, number])[] = [
  [401, 404],
  [301, 303],
  [305, 399],
];

/**
 * If the given status code should be filtered for the given list of status codes/ranges.
 */
export function shouldFilterStatusCode(statusCode: number, dropForStatusCodes: (number | [number, number])[]): boolean {
  return dropForStatusCodes.some(code => {
    if (typeof code === 'number') {
      return code === statusCode;
    }

    const [min, max] = code;
    return statusCode >= min && statusCode <= max;
  });
}

/**
 * Drop transaction events whose HTTP status code matches `ignoreStatusCodes`, and surface the
 * status as the top-level `response` context on the ones that are kept.
 *
 * Pass `spanOrigin` to only act on transactions produced by a specific instrumentation, so that
 * an integration owning this option does not filter transactions created by a different one.
 * When omitted, every transaction carrying an HTTP status code is considered.
 *
 * Returns `null` when the event should be dropped, otherwise the (possibly updated) event.
 */
export function processHttpServerTransactionEvent(
  event: Event,
  ignoreStatusCodes: (number | [number, number])[],
  spanOrigin?: string,
): Event | null {
  if (event.type !== 'transaction') {
    return event;
  }

  if (spanOrigin !== undefined && event.contexts?.trace?.origin !== spanOrigin) {
    return event;
  }

  const statusCode = event.contexts?.trace?.data?.[HTTP_RESPONSE_STATUS_CODE];
  if (typeof statusCode !== 'number') {
    return event;
  }

  if (shouldFilterStatusCode(statusCode, ignoreStatusCodes)) {
    DEBUG_BUILD && debug.log('Dropping transaction due to status code', statusCode);
    return null;
  }

  // Surface the HTTP status as the top-level `response` context. The OTel SDK span exporter
  // already does this on its path; doing it here covers transactions produced by tracer
  // providers that bypass that exporter (Node's `SentryTracerProvider`, Deno's).
  event.contexts = {
    ...event.contexts,
    response: {
      ...event.contexts?.response,
      status_code: statusCode,
    },
  };

  return event;
}
