import { getCurrentHub } from '@sentry/core';
import { Span } from '@sentry/types';
import * as http from 'http';
import { URL } from 'url';

/**
 * Checks whether given url points to Sentry server
 * @param url url to verify
 */
export function isSentryRequest(url: string): boolean {
  const client = getCurrentHub().getClient();
  if (!url || !client) {
    return false;
  }

  const dsn = client.getDsn();
  if (!dsn) {
    return false;
  }

  return url.indexOf(dsn.host) !== -1;
}

/**
 * Assemble a URL to be used for breadcrumbs and spans.
 *
 * @param requestOptions RequestOptions object containing the component parts for a URL
 * @returns Fully-formed URL
 */
export function extractUrl(requestOptions: RequestOptions): string {
  const protocol = requestOptions.protocol || '';
  const hostname = requestOptions.hostname || requestOptions.host || '';
  // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
  const port =
    !requestOptions.port || requestOptions.port === 80 || requestOptions.port === 443 ? '' : `:${requestOptions.port}`;
  const path = requestOptions.path ? requestOptions.path : '/';

  return `${protocol}//${hostname}${port}${path}`;
}

/**
 * Handle various edge cases in the span description. Runs just before the span closes because in one case it relies on
 * data from the response object.
 *
 * @param requestOptions Configuration data for the request
 * @param response Response object
 * @param span Span representing the request
 */
export function cleanSpanDescription(requestOptions: RequestOptions, response: http.IncomingMessage, span: Span): void {
  // superagent sticks the protocol in a weird place (we check for host because if both host *and* protocol are missing,
  // we're likely dealing with an internal route and this doesn't apply)
  if (requestOptions.host && !('protocol' in requestOptions)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    requestOptions.protocol = (response as any).agent?.protocol; // worst comes to worst, this is undefined and nothing changes
    span.description = `${requestOptions.method || 'GET'} ${extractUrl(requestOptions)}`;
  }

  // internal routes can end up starting with a triple slash rather than a single one
  if (span.description?.startsWith('///')) {
    span.description = span.description.slice(2);
  }
}

// the node types are missing a few properties which node's `urlToOptions` function spits out
export type RequestOptions = http.RequestOptions & { hash?: string; search?: string; pathname?: string; href?: string };
type RequestCallback = (response: http.IncomingMessage) => void;
export type RequestMethodArgs =
  | [RequestOptions | string | URL, RequestCallback?]
  | [string | URL, RequestOptions, RequestCallback?];
export type RequestMethod = (...args: RequestMethodArgs) => http.ClientRequest;

/**
 * Convert a URL object into a RequestOptions object.
 *
 * Copied from Node's internals (where it's used in http(s).request() and http(s).get()), modified only to use the
 * RequestOptions type above.
 *
 * See https://github.com/nodejs/node/blob/master/lib/internal/url.js.
 */
export function urlToOptions(url: URL): RequestOptions {
  const options: RequestOptions = {
    protocol: url.protocol,
    hostname:
      typeof url.hostname === 'string' && url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname || ''}${url.search || ''}`,
    href: url.href,
  };
  if (url.port !== '') {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${url.username}:${url.password}`;
  }
  return options;
}

/**
 * Normalize inputs to `http(s).request()` and `http(s).get()`.
 *
 * Legal inputs to `http(s).request()` and `http(s).get()` can take one of ten forms:
 *     [ RequestOptions | string | URL ],
 *     [ RequestOptions | string | URL, RequestCallback ],
 *     [ string | URL, RequestOptions ], and
 *     [ string | URL, RequestOptions, RequestCallback ].
 *
 * This standardizes to one of two forms: [ RequestOptions ] and [ RequestOptions, RequestCallback ]. A similar thing is
 * done as the first step of `http(s).request()` and `http(s).get()`; this just does it early so that we can interact
 * with the args in a standard way.
 *
 * @param requestArgs The inputs to `http(s).request()` or `http(s).get()`, as an array.
 *
 * @returns Equivalent args of the form [ RequestOptions ] or [ RequestOptions, RequestCallback ].
 */
export function normalizeRequestArgs(
  requestArgs: RequestMethodArgs,
): [RequestOptions] | [RequestOptions, RequestCallback] {
  let callback, requestOptions;

  // pop off the callback, if there is one
  if (typeof requestArgs[requestArgs.length - 1] === 'function') {
    callback = requestArgs.pop() as RequestCallback;
  }

  // create a RequestOptions object of whatever's at index 0
  if (typeof requestArgs[0] === 'string') {
    requestOptions = urlToOptions(new URL(requestArgs[0]));
  } else if (requestArgs[0] instanceof URL) {
    requestOptions = urlToOptions(requestArgs[0]);
  } else {
    requestOptions = requestArgs[0];
  }

  // if the options were given separately from the URL, fold them in
  if (requestArgs.length === 2) {
    requestOptions = { ...requestOptions, ...requestArgs[1] };
  }

  // return args in standardized form
  if (callback) {
    return [requestOptions, callback];
  } else {
    return [requestOptions];
  }
}
