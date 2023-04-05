// This should be: null | Blob | BufferSource | FormData | URLSearchParams | string
// But since not all of those are available in node, we just export `unknown` here for now
// Make sure to cast it where needed!
type XHRSendInput = unknown;

export interface SentryWrappedXMLHttpRequest {
  __sentry_xhr__?: SentryXhrData;
  __sentry_own_request__?: boolean;
}

export interface SentryXhrData {
  method?: string;
  url?: string;
  status_code?: number;
  body?: XHRSendInput;
  request_body_size?: number;
  response_body_size?: number;
  request_headers: Record<string, string>;
}

export interface HandlerDataXhr {
  args: [string, string];
  xhr: SentryWrappedXMLHttpRequest;
  startTimestamp?: number;
  endTimestamp?: number;
}

interface SentryFetchData {
  method: string;
  url: string;
  request_body_size?: number;
  response_body_size?: number;
}

export interface HandlerDataFetch {
  args: any[];
  fetchData: SentryFetchData;
  startTimestamp: number;
  endTimestamp?: number;
  // This is actually `Response`, make sure to cast this where needed (not available in Node)
  response?: unknown;
}
