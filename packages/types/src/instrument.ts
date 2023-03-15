// This should be: null | Blob | BufferSource | FormData | URLSearchParams | string
// But since not all of those are available in node, we just export `unknown` here for now
// Make sure to cast it where needed!
type XHRSendInput = unknown;

export interface SentryWrappedXMLHttpRequest {
  [key: string]: any;
  __sentry_xhr__?: {
    method?: string;
    url?: string;
    status_code?: number;
    body?: XHRSendInput;
  };
}

interface SentryFetchData {
  method: string;
  url: string;
}

export interface HandlerDataFetch {
  args: any[];
  fetchData: SentryFetchData;
  startTimestamp: number;
  // This is actually `Response`, make sure to cast this where needed (not available in Node)
  response?: unknown;
}
