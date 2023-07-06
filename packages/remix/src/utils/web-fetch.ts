// Based on Remix's implementation of Fetch API
// https://github.com/remix-run/web-std-io/blob/d2a003fe92096aaf97ab2a618b74875ccaadc280/packages/fetch/
// The MIT License (MIT)

// Copyright (c) 2016 - 2020 Node Fetch Team

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { logger } from '@sentry/utils';

import { getClientIPAddress } from './vendor/getIpAddress';
import type { RemixRequest } from './vendor/types';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bodyInternalsSymbol: symbols.find(symbol => symbol.toString().includes('Body internals')) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
