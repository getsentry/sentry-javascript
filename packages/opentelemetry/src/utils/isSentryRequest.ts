import { ATTR_URL_FULL, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import { getClient, isSentryRequestUrl } from '@sentry/core';
import type { AbstractSpan } from '../types';
import { spanHasAttributes } from './spanTypes';

/**
 *
 * @param otelSpan Checks whether a given OTEL Span is an http request to sentry.
 * @returns boolean
 */
export function isSentryRequestSpan(span: AbstractSpan): boolean {
  // NOTE: `@sentry/nextjs` has a local copy of this helper for Edge bundles:
  // - `packages/nextjs/src/common/utils/dropMiddlewareTunnelRequests.ts` (`isSentryRequestSpan`)
  //
  // If you change supported OTEL attribute keys or request detection logic, update that file too.
  if (!spanHasAttributes(span)) {
    return false;
  }

  const { attributes } = span;

  // `ATTR_URL_FULL` is the new attribute, but we still support the old one, `ATTR_HTTP_URL`, for now.
  // eslint-disable-next-line deprecation/deprecation
  const httpUrl = attributes[SEMATTRS_HTTP_URL] || attributes[ATTR_URL_FULL];

  if (!httpUrl) {
    return false;
  }

  return isSentryRequestUrl(httpUrl.toString(), getClient());
}
