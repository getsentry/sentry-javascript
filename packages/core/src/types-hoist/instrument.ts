// This should be: null | Blob | BufferSource | FormData | URLSearchParams | string
// But since not all of those are available in node, we just export `unknown` here for now

import type { WebFetchHeaders } from './webfetchapi';

// Make sure to cast it where needed!
type XHRSendInput = unknown;

export type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error' | 'log' | 'assert' | 'trace';

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
}

interface SentryFetchData {
  method: string;
  url: string;
  request_body_size?: number;
  response_body_size?: number;
  // span_id for the fetch request
  __span?: string;
}

export interface HandlerDataFetch {
  args: any[];
  fetchData: SentryFetchData; // This data is among other things dumped directly onto the fetch breadcrumb data
  startTimestamp: number;
  endTimestamp?: number;
  // This is actually `Response` - Note: this type is not complete. Add to it if necessary.
  response?: {
    readonly ok: boolean;
    readonly status: number;
    readonly url: string;
    headers: WebFetchHeaders;
  };
  error?: unknown;
}

export interface HandlerDataDom {
  // TODO: Replace `object` here with a vendored type for browser Events. We can't depend on the `DOM` or `react` TS types package here.
  event: object | { target: object };
  name: string;
  global?: boolean;
}

export interface HandlerDataConsole {
  level: ConsoleLevel;
  args: any[];
}

export interface HandlerDataHistory {
  from: string | undefined;
  to: string;
}

export interface HandlerDataError {
  column?: number;
  error?: Error;
  line?: number;
  // TODO: Replace `object` here with a vendored type for browser Events. We can't depend on the `DOM` or `react` TS types package here.
  msg: string | object;
  url?: string;
}

export type HandlerDataUnhandledRejection = unknown;
