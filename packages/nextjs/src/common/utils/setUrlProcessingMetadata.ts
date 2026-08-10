import type { Span } from '@sentry/core';
import { getCapturedScopesOnSpan, spanToJSON } from '@sentry/core';
import { getSanitizedRequestUrl } from './urls';

/**
 * Backfills the request URL on the segment span's isolation scope, so `requestDataIntegration`
 * picks it up for every event of the request (including errors).
 */
export function setUrlProcessingMetadata(span: Span): void {
  const { op, data: attributes } = spanToJSON(span);
  if (op !== 'http.server') {
    return;
  }

  // Get the route from the span attributes
  const componentRoute = attributes['next.route'] || attributes['http.route'];
  const httpTarget = attributes['http.target'];

  if (!componentRoute) {
    return;
  }

  const isolationScopeData = getCapturedScopesOnSpan(span).isolationScope?.getScopeData();
  const headersDict = isolationScopeData?.sdkProcessingMetadata?.normalizedRequest?.headers;

  const url = getSanitizedRequestUrl(String(componentRoute), undefined, headersDict, httpTarget?.toString());

  if (url && isolationScopeData?.sdkProcessingMetadata) {
    isolationScopeData.sdkProcessingMetadata.normalizedRequest =
      isolationScopeData.sdkProcessingMetadata.normalizedRequest || {};
    isolationScopeData.sdkProcessingMetadata.normalizedRequest.url = url;
  }
}
