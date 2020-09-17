/** Possible SentryRequest types that can be used to make a distinction between Sentry features */
export type SentryRequestType = 'event' | 'transaction' | 'session';

/** A generic client request. */
export interface SentryRequest {
  body: string;
  type: SentryRequestType;
  url: string;
  // headers would contain auth & content-type headers for @sentry/node, but
  // since @sentry/browser avoids custom headers to prevent CORS preflight
  // requests, we can use the same approach for @sentry/browser and @sentry/node
  // for simplicity -- no headers involved.
  // headers: { [key: string]: string };
}

/** Request data included in an event as sent to Sentry */
export interface Request {
  url?: string;
  method?: string;
  data?: any;
  query_string?: string;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
  headers?: { [key: string]: string };
}
