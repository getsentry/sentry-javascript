import { ReplayPerformanceEntry } from '../createPerformanceEntry';
import { isIngestHost } from '../util/isIngestHost';

// From sentry-javascript
// e.g. https://github.com/getsentry/sentry-javascript/blob/c7fc025bf9fa8c073fdb56351808ce53909fbe45/packages/utils/src/instrument.ts#L180
type XHRSendInput = null | Blob | BufferSource | FormData | URLSearchParams | string;

interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
  [key: string]: unknown;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
    body?: XHRSendInput;
    startTimestamp?: number; // This is unique to replay SDK
  };
  // If Sentry key appears in request, don't capture as request
  // See https://github.com/getsentry/sentry-javascript/blob/c7fc025bf9fa8c073fdb56351808ce53909fbe45/packages/utils/src/instrument.ts#L236
  __sentry_own_request__?: boolean;
}

interface XhrHandlerData {
  args: [string, string];
  xhr: SentryWrappedXMLHttpRequest;
  startTimestamp: number;
  endTimestamp?: number;
}

export function handleXhr(handlerData: XhrHandlerData): ReplayPerformanceEntry | null {
  if (handlerData.xhr.__sentry_own_request__) {
    // Taken from sentry-javascript
    // Only capture non-sentry requests
    return null;
  }

  if (handlerData.startTimestamp) {
    // TODO: See if this is still needed
    handlerData.xhr.__sentry_xhr__ = handlerData.xhr.__sentry_xhr__ || {};
    handlerData.xhr.__sentry_xhr__.startTimestamp = handlerData.startTimestamp;
  }

  if (!handlerData.endTimestamp) {
    return null;
  }

  const { method, url, status_code: statusCode } = handlerData.xhr.__sentry_xhr__ || {};

  // Do not capture fetches to Sentry ingestion endpoint
  if (url === undefined || isIngestHost(url)) {
    return null;
  }

  return {
    type: 'resource.xhr',
    name: url,
    start: (handlerData.xhr.__sentry_xhr__?.startTimestamp || 0) / 1000 || handlerData.endTimestamp / 1000.0,
    end: handlerData.endTimestamp / 1000.0,
    data: {
      method,
      statusCode,
    },
  };
}
