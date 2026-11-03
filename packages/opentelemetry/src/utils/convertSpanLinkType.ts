import type { Link } from '@opentelemetry/api';
import type { SpanLink } from '@sentry/core';

/**
 * Converts OpenTelemetry span links to Sentry span links.
 *
 * Since `@opentelemetry/api` 1.10.0, link attribute values are typed as `unknown`.
 * Sentry's `SpanLink` only accepts strings, numbers, booleans and arrays of these as attribute values,
 * so OTel links do not match its type.
 */
export function convertSpanLinkType(links: Link[] | undefined): SpanLink[] | undefined {
  return links as SpanLink[] | undefined;
}
