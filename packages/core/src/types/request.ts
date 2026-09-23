import type { HTTP_REQUEST_METHOD, URL_FRAGMENT, URL_QUERY } from '@sentry/conventions/attributes';
import type { WebFetchHeaders } from './webfetchapi';

/**
 * Request data included in an event as sent to Sentry.
 */
export interface RequestEventData {
  url?: string;
  method?: string;
  data?: unknown;
  query_string?: QueryParams;
  cookies?: Record<string, string>;
  env?: Record<string, string>;
  headers?: { [key: string]: string };
}

export type QueryParams = string | { [key: string]: string } | Array<[string, string]>;

/**
 * Request data that is considered safe for `span.data` on `http.client` spans
 * and for `http` breadcrumbs
 * See https://develop.sentry.dev/sdk/data-handling/#structuring-data
 */
export type SanitizedRequestData = {
  /**
   * The sanitized URL. Named `url` rather than `url.full` because this shape is also used for
   * `http` breadcrumb data, where `url` is the field the Sentry UI renders (see
   * {@link FetchBreadcrumbData}). Span attributes use `url.full` instead.
   */
  url: string;
  [HTTP_REQUEST_METHOD]: string;
  [URL_FRAGMENT]?: string;
  [URL_QUERY]?: string;
};

export interface RequestHookInfo {
  headers?: WebFetchHeaders;
}

export interface ResponseHookInfo {
  /**
   * Headers from the response.
   */
  headers?: WebFetchHeaders;

  /**
   * Error that may have occurred during the request.
   */
  error?: unknown;
}
