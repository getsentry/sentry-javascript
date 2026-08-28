import type { WebFetchHeaders } from './webfetchapi';

export type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error' | 'log' | 'assert' | 'trace';

interface SentryFetchData {
  method: string;
  url: string;
  request_body_size?: number;
  response_body_size?: number;
  // span_id for the fetch request
  __span?: string;
}

export interface HandlerDataFetch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // This is to be consumed by the HttpClient integration
  virtualError?: unknown;
  /** Headers that the user passed to the fetch request. */
  headers?: WebFetchHeaders;
}

export interface HandlerDataConsole {
  level: ConsoleLevel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];
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
