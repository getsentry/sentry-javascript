import { HTTP_RESPONSE_STATUS_CODE, HTTP_STATUS_CODE } from '@sentry/conventions/attributes';

/**
 * Next.js' OTel instrumentation only sets the deprecated `http.status_code` attribute on its request
 * root spans. Backfill the modern `http.response.status_code` from it so downstream consumers that
 * rely on the current convention still see the status code.
 */
export function backfillHttpResponseStatusCode(attributes: Record<string, unknown>): void {
  // eslint-disable-next-line typescript/no-deprecated
  const legacyHttpStatusCode = attributes[HTTP_STATUS_CODE];

  if (attributes[HTTP_RESPONSE_STATUS_CODE] === undefined && legacyHttpStatusCode !== undefined) {
    attributes[HTTP_RESPONSE_STATUS_CODE] = legacyHttpStatusCode;
  }
}
