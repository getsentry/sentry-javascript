/**
 * Request data included in an event as sent to Sentry.
 */
export interface RequestEventData {
  url?: string;
  method?: string;
  data?: any;
  query_string?: QueryParams;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
  headers?: { [key: string]: string };
}

/**
 * Request data included in an event as sent to Sentry.
 * @deprecated: This type will be removed in v9. Use `RequestEventData` instead.
 */
export type Request = RequestEventData;

export type QueryParams = string | { [key: string]: string } | Array<[string, string]>;

/**
 * Request data that is considered safe for `span.data` on `http.client` spans
 * and for `http` breadcrumbs
 * See https://develop.sentry.dev/sdk/data-handling/#structuring-data
 */
export type SanitizedRequestData = {
  url: string;
  'http.method': string;
  'http.fragment'?: string;
  'http.query'?: string;
};
