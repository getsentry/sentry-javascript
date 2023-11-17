// This should be: null | Blob | BufferSource | FormData | URLSearchParams | string
// But since not all of those are available in node, we just export `unknown` here for now
// Make sure to cast it where needed!
type XHRSendInput = unknown;

export interface SentryWrappedXMLHttpRequest {
  __sentry_xhr_v2__?: SentryXhrData;
  __sentry_own_request__?: boolean;
}

// WARNING: When the shape of this type is changed bump the version in `SentryWrappedXMLHttpRequest`
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
  // span_id for the fetch request
  __span?: string;
}

export interface HandlerDataFetch {
  args: any[];
  fetchData: SentryFetchData;
  startTimestamp: number;
  endTimestamp?: number;
  // This is actually `Response` - Note: this type is not complete. Add to it if necessary.
  response?: {
    readonly ok: boolean;
    readonly status: number;
    readonly url: string;
    headers: {
      append(name: string, value: string): void;
      delete(name: string): void;
      get(name: string): string | null;
      has(name: string): boolean;
      set(name: string, value: string): void;
    };
  };
  error?: unknown;
}
