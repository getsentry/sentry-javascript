import type { Event } from '@sentry/core';
import { getClient } from '@sentry/core';
import { getSanitizedRequestUrl } from './urls';

/**
 * Sets the URL processing metadata for the event.
 */
export function setUrlProcessingMetadata(event: Event): void {
  // Skip if not a server-side transaction
  if (event.type !== 'transaction' || event.contexts?.trace?.op !== 'http.server' || !event.contexts?.trace?.data) {
    return;
  }

  // Only add URL if sendDefaultPii is enabled, as URLs may contain PII
  const client = getClient();
  if (!client?.getOptions().sendDefaultPii) {
    return;
  }

  const traceData = event.contexts.trace.data;

  // Get the route from trace data
  const componentRoute = traceData['next.route'] || traceData['http.route'];
  const httpTarget = traceData['http.target'] as string | undefined;

  if (!componentRoute) {
    return;
  }

  // Extract headers
  const isolationScopeData = event.sdkProcessingMetadata?.capturedSpanIsolationScope?.getScopeData();
  const headersDict = isolationScopeData?.sdkProcessingMetadata?.normalizedRequest?.headers;

  const url = getSanitizedRequestUrl(componentRoute, undefined, headersDict, httpTarget?.toString());

  // Add URL to the isolation scope's normalizedRequest so requestDataIntegration picks it up
  if (url && isolationScopeData?.sdkProcessingMetadata) {
    isolationScopeData.sdkProcessingMetadata.normalizedRequest =
      isolationScopeData.sdkProcessingMetadata.normalizedRequest || {};
    isolationScopeData.sdkProcessingMetadata.normalizedRequest.url = url;
  }
}
