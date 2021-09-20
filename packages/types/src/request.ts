/** Possible SentryRequest types that can be used to make a distinction between Sentry features */
// NOTE(kamil): It would be nice if we make it a valid enum instead
export type SentryRequestType = 'event' | 'transaction' | 'session' | 'attachment';

/** A generic client request. */
export interface SentryRequest {
  body: string;
  type: SentryRequestType;
  url: string;
}

/** Request data included in an event as sent to Sentry */
export interface Request {
  url?: string;
  method?: string;
  data?: any;
  query_string?: QueryParams;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
  headers?: { [key: string]: string };
}

export type QueryParams = string | { [key: string]: string } | Array<[string, string]>;
