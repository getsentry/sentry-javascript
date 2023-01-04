// Based on Remix's implementation of Fetch API
// https://github.com/remix-run/web-std-io/tree/main/packages/fetch

import { logger } from '@sentry/utils';

import { getClientIPAddress } from './getIpAddress';
import type { RemixRequest } from './types';

/*
 * Symbol extractor utility to be able to access internal fields of Remix requests.
 */
const getInternalSymbols = (
  request: Record<string, unknown>,
): {
  bodyInternalsSymbol: string;
  requestInternalsSymbol: string;
} => {
  const symbols = Object.getOwnPropertySymbols(request);
  return {
    bodyInternalsSymbol: symbols.find(symbol => symbol.toString().includes('Body internals')) as any,
    requestInternalsSymbol: symbols.find(symbol => symbol.toString().includes('Request internals')) as any,
  };
};

/**
 * Vendored from:
 * https://github.com/remix-run/web-std-io/blob/f715b354c8c5b8edc550c5442dec5712705e25e7/packages/fetch/src/utils/get-search.js#L5
 */
export const getSearch = (parsedURL: URL): string => {
  if (parsedURL.search) {
    return parsedURL.search;
  }

  const lastOffset = parsedURL.href.length - 1;
  const hash = parsedURL.hash || (parsedURL.href[lastOffset] === '#' ? '#' : '');
  return parsedURL.href[lastOffset - hash.length] === '?' ? '?' : '';
};

/**
 * Convert a Request to Node.js http request options.
 * The options object to be passed to http.request
 * Vendored / modified from:
 * https://github.com/remix-run/web-std-io/blob/f715b354c8c5b8edc550c5442dec5712705e25e7/packages/fetch/src/request.js#L259
 */
export const normalizeRemixRequest = (request: RemixRequest): Record<string, any> => {
  const { requestInternalsSymbol, bodyInternalsSymbol } = getInternalSymbols(request);

  if (!requestInternalsSymbol) {
    throw new Error('Could not find request internals symbol');
  }

  const { parsedURL } = request[requestInternalsSymbol];
  const headers = new Headers(request[requestInternalsSymbol].headers);

  // Fetch step 1.3
  if (!headers.has('Accept')) {
    headers.set('Accept', '*/*');
  }

  // HTTP-network-or-cache fetch steps 2.4-2.7
  let contentLengthValue = null;
  if (request.body === null && /^(post|put)$/i.test(request.method)) {
    contentLengthValue = '0';
  }

  if (request.body !== null) {
    const totalBytes = request[bodyInternalsSymbol].size;
    // Set Content-Length if totalBytes is a number (that is not NaN)
    if (typeof totalBytes === 'number' && !Number.isNaN(totalBytes)) {
      contentLengthValue = String(totalBytes);
    }
  }

  if (contentLengthValue) {
    headers.set('Content-Length', contentLengthValue);
  }

  // HTTP-network-or-cache fetch step 2.11
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'node-fetch');
  }

  // HTTP-network-or-cache fetch step 2.15
  if (request.compress && !headers.has('Accept-Encoding')) {
    headers.set('Accept-Encoding', 'gzip,deflate,br');
  }

  let { agent } = request;

  if (typeof agent === 'function') {
    agent = agent(parsedURL);
  }

  if (!headers.has('Connection') && !agent) {
    headers.set('Connection', 'close');
  }

  let ip;

  // Using a try block here not to break the whole request if we can't get the IP address
  try {
    ip = getClientIPAddress(headers);
  } catch (e) {
    __DEBUG_BUILD__ && logger.warn('Could not get client IP address', e);
  }

  // HTTP-network fetch step 4.2
  // chunked encoding is handled by Node.js
  const search = getSearch(parsedURL);

  // Manually spread the URL object instead of spread syntax
  const requestOptions = {
    path: parsedURL.pathname + search,
    pathname: parsedURL.pathname,
    hostname: parsedURL.hostname,
    protocol: parsedURL.protocol,
    port: parsedURL.port,
    hash: parsedURL.hash,
    search: parsedURL.search,
    // @ts-ignore - it does not has a query
    query: parsedURL.query,
    href: parsedURL.href,
    method: request.method,
    // @ts-ignore - not sure what this supposed to do
    headers: headers[Symbol.for('nodejs.util.inspect.custom')](),
    insecureHTTPParser: request.insecureHTTPParser,
    agent,

    // [SENTRY] For compatibility with Sentry SDK RequestData parser, adding `originalUrl` property.
    originalUrl: parsedURL.href,

    // [SENTRY] Adding `ip` property if found inside headers.
    ip,
  };

  return requestOptions;
};
