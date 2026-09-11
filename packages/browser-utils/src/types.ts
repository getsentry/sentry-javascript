import type { FetchBreadcrumbHint, HandlerDataFetch } from '@sentry/core';
import type { XhrBreadcrumbHint } from '@sentry/core/browser';
import { GLOBAL_OBJ } from '@sentry/core';

export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ &
  // document is not available in all browser environments (webworkers). We make it optional so you have to explicitly check for it
  Omit<Window, 'document'> &
  Partial<Pick<Window, 'document'>>;

export type NetworkMetaWarning =
  | 'MAYBE_JSON_TRUNCATED'
  | 'TEXT_TRUNCATED'
  | 'URL_SKIPPED'
  | 'BODY_PARSE_ERROR'
  | 'BODY_PARSE_TIMEOUT'
  | 'UNPARSEABLE_BODY_TYPE';

type RequestBody = null | Blob | BufferSource | FormData | URLSearchParams | string;

export type XhrHint = XhrBreadcrumbHint & {
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest;
  input?: RequestBody;
};
export type FetchHint = FetchBreadcrumbHint & {
  input: HandlerDataFetch['args'];
  response: Response;
};

// This should be: null | Blob | BufferSource | FormData | URLSearchParams | string
// But since not all of those are available in node, we just use `unknown` here for now
type XHRSendInput = unknown;

export interface SentryWrappedXMLHttpRequest {
  __sentry_xhr_v3__?: SentryXhrData;
  __sentry_own_request__?: boolean;
  // span id for the xhr request
  __sentry_xhr_span_id__?: string;
  setRequestHeader?: (key: string, val: string) => void;
  getResponseHeader?: (key: string) => string | null;
}

// WARNING: When the shape of this type is changed bump the version in `SentryWrappedXMLHttpRequest`
export interface SentryXhrData {
  method: string;
  url: string;
  status_code?: number;
  body?: XHRSendInput;
  request_body_size?: number;
  response_body_size?: number;
  request_headers: Record<string, string>;
}

export interface HandlerDataXhr {
  xhr: SentryWrappedXMLHttpRequest;
  startTimestamp?: number;
  endTimestamp?: number;
  error?: unknown;
  // This is to be consumed by the HttpClient integration
  virtualError?: unknown;
}

export interface HandlerDataDom {
  // TODO: Replace `object` here with a vendored type for browser Events. We can't depend on the `DOM` or `react` TS types package here.
  event: object | { target: object };
  name: string;
  global?: boolean;
}

export interface HandlerDataHistory {
  /** The full URL of the previous page */
  from: string | undefined;
  /** The full URL of the new page */
  to: string;
}
