import { getCurrentHub } from '@sentry/core';
import { parseSemver } from '@sentry/utils';
import type * as http from 'http';
import type * as https from 'https';
import { URL } from 'url';

const NODE_VERSION = parseSemver(process.versions.node);

/**
 * Checks whether given url points to Sentry server
 * @param url url to verify
 */
export function isSentryRequest(url: string): boolean {
  const dsn = getCurrentHub().getClient()?.getDsn();
  return dsn ? url.includes(dsn.host) : false;
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
 * Handle various edge cases in the span description (for spans representing http(s) requests).
 *
 * @param description current `description` property of the span representing the request
 * @param requestOptions Configuration data for the request
 * @param Request Request object
 *
 * @returns The cleaned description
 */
export function cleanSpanDescription(
  description: string | undefined,
  requestOptions: RequestOptions,
  request: http.ClientRequest,
): string | undefined {
  // nothing to clean
  if (!description) {
    return description;
  }

  // eslint-disable-next-line prefer-const
  let [method, requestUrl] = description.split(' ');

  // superagent sticks the protocol in a weird place (we check for host because if both host *and* protocol are missing,
  // we're likely dealing with an internal route and this doesn't apply)
  if (requestOptions.host && !requestOptions.protocol) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    requestOptions.protocol = (request as any)?.agent?.protocol; // worst comes to worst, this is undefined and nothing changes
    requestUrl = extractUrl(requestOptions);
  }

  // internal routes can end up starting with a triple slash rather than a single one
  if (requestUrl?.startsWith('///')) {
    requestUrl = requestUrl.slice(2);
  }

  return `${method} ${requestUrl}`;
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
  httpModule: typeof http | typeof https,
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

  // Figure out the protocol if it's currently missing
  if (requestOptions.protocol === undefined) {
    // Worst case we end up populating protocol with undefined, which it already is
    /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

    // NOTE: Prior to Node 9, `https` used internals of `http` module, thus we don't patch it.
    // Because of that, we cannot rely on `httpModule` to provide us with valid protocol,
    // as it will always return `http`, even when using `https` module.
    //
    // See test/integrations/http.test.ts for more details on Node <=v8 protocol issue.
    if (NODE_VERSION.major && NODE_VERSION.major > 8) {
      requestOptions.protocol =
        (httpModule?.globalAgent as any)?.protocol ||
        (requestOptions.agent as any)?.protocol ||
        (requestOptions._defaultAgent as any)?.protocol;
    } else {
      requestOptions.protocol =
        (requestOptions.agent as any)?.protocol ||
        (requestOptions._defaultAgent as any)?.protocol ||
        (httpModule?.globalAgent as any)?.protocol;
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
  }

  // return args in standardized form
  if (callback) {
    return [requestOptions, callback];
  } else {
    return [requestOptions];
  }
}
