type XHRSendInput = null | Blob | BufferSource | FormData | URLSearchParams | string;

export interface SentryWrappedXMLHttpRequest extends XMLHttpRequest {
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
  response?: Response;
}
