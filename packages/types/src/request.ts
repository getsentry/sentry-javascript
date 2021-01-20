/** Possible SentryRequest types that can be used to make a distinction between Sentry features */
export type SentryRequestType = 'event' | 'transaction' | 'session';

/** A generic client request. */
export interface SentryRequest {
  body: string;
  type: SentryRequestType;
  url: string;
}

/**
 * The Request interface contains information on a HTTP request related to the event.
 * In client SDKs, this can be an outgoing request, or the request that rendered the current web page.
 * On server SDKs, this could be the incoming web request that is being handled.
 * @external https://develop.sentry.dev/sdk/event-payloads/request/
 */
export interface Request {
  /**
   * The HTTP method of the request.
   */
  method?: string;

  /**
   * The URL of the request if available.
   * The query string can be declared either as part of the url,
   * or separately in queryString.
   */
  url?: string;

  /**
   * The query string component of the URL. Can be given as unparsed string, dictionary, or list of tuples.
   * If the query string is not declared and part of the url parameter, Sentry moves it to the query string.
   */
  query_string?: string;

  /**
   * Submitted data in a format that makes the most sense.
   * Can be given as string or structural data of any format.
   */
  data?: unknown;

  /**
   * The cookie values.
   * Can be given unparsed as string, as dictionary, or as a list of tuples.
   */
  cookies?: Record<string, string> | string;

  /**
   * A dictionary of submitted headers.
   * If a header appears multiple times it, needs to be merged according to the HTTP standard for header merging.
   * Header names are treated case-insensitively by Sentry.
   */
  headers?: Record<string, string>;

  /**
   * A dictionary containing environment information passed from the server.
   * This is where information such as CGI/WSGI/Rack keys go that are not HTTP headers.
   * Sentry will explicitly look for REMOTE_ADDR to extract an IP address.
   */
  env?: Record<string, string>;
}
