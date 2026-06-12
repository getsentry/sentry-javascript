import { HTTP_URL, URL_FULL } from '@sentry/conventions/attributes';
import { getClient, isSentryRequestUrl } from '@sentry/core';
import type { AbstractSpan } from '../types';
import { spanHasAttributes } from './spanTypes';

/**
 *
 * @param otelSpan Checks whether a given OTEL Span is an http request to sentry.
 * @returns boolean
 */
export function isSentryRequestSpan(span: AbstractSpan): boolean {
  if (!spanHasAttributes(span)) {
    return false;
  }

  const { attributes } = span;

  // `URL_FULL` is the new attribute, but we still support the old one, `HTTP_URL`, for now.
  const httpUrl = attributes[HTTP_URL] || attributes[URL_FULL];

  if (!httpUrl) {
    return false;
  }

  return isSentryRequestUrl(httpUrl.toString(), getClient());
}
