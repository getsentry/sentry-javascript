import type { Client } from '@sentry/core';
import { debug, getTraceServerTimingHeader, isObjectLike, isSharedCacheable } from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';

const SERVER_TIMING_HEADER = 'server-timing';

interface HttpServerResponse {
  headersSent: boolean;
  getHeader(name: string): number | string | string[] | undefined;
  setHeader(name: string, value: string): unknown;
  writeHead(...args: unknown[]): unknown;
}

type HeaderObject = Record<string, unknown>;

function isHttpServerResponse(response: unknown): response is HttpServerResponse {
  return (
    isObjectLike(response) &&
    typeof response.writeHead === 'function' &&
    typeof response.getHeader === 'function' &&
    typeof response.setHeader === 'function'
  );
}

/**
 * Sends the trace of the request in a `Server-Timing` header of a document response of the Node.js
 * server, so the browser SDK continues it in the pageload span before any HTML arrived. Next.js
 * flushes the headers with the first chunk of the document, inside the request span, so the value is
 * computed then rather than when the request comes in. The hook fires for every request, also when
 * incoming request spans are disabled, which the Next.js SDK does because Next.js starts the request
 * span.
 */
export function addServerTimingTraceHeader(client: Client): void {
  client.on('httpServerRequest', (_request, response) => {
    if (!isHttpServerResponse(response)) {
      return;
    }

    const writeHead = response.writeHead.bind(response);
    response.writeHead = (...args: unknown[]): unknown => {
      setServerTimingTraceHeader(response, getHeaderObjectArgument(args));
      return writeHead(...args);
    };
  });
}

// `writeHead(status[, message], headers)`: headers given here win over `setHeader` ones.
function getHeaderObjectArgument(args: unknown[]): HeaderObject | undefined {
  const last = args[args.length - 1];
  return args.length > 1 && isObjectLike(last) && !Array.isArray(last) ? last : undefined;
}

function findHeaderKey(headers: HeaderObject | undefined, name: string): string | undefined {
  return headers && Object.keys(headers).find(key => key.toLowerCase() === name);
}

function readHeader(response: HttpServerResponse, headers: HeaderObject | undefined, name: string): string | undefined {
  const key = findHeaderKey(headers, name);
  const value = key ? headers?.[key] : response.getHeader(name);
  return Array.isArray(value) ? value.join(', ') : value?.toString();
}

// Only the navigation entry of a document exposes the header to the browser SDK.
function isDocument(response: HttpServerResponse, headers: HeaderObject | undefined): boolean {
  const contentType = readHeader(response, headers, 'content-type');
  return !contentType || contentType.startsWith('text/html');
}

/**
 * Adds the trace of the current context to the `Server-Timing` header of a document response that no
 * shared cache may store. Next.js sends static and ISR documents with `s-maxage`, and a CDN in front of
 * the server that stores them would replay the trace, and the sampling decision, of one visitor to
 * everyone who gets the cached copy. An existing `sentry-trace` entry of the app is left alone.
 *
 * @internal
 */
export function setServerTimingTraceHeader(response: HttpServerResponse, headers?: HeaderObject): void {
  try {
    if (
      response.headersSent ||
      isSharedCacheable(name => readHeader(response, headers, name)) ||
      !isDocument(response, headers)
    ) {
      return;
    }

    const existingValue = readHeader(response, headers, SERVER_TIMING_HEADER);
    if (existingValue?.includes('sentry-trace')) {
      return;
    }

    const traceHeader = getTraceServerTimingHeader();
    if (!traceHeader) {
      return;
    }

    const value = existingValue ? `${existingValue}, ${traceHeader}` : traceHeader;
    const key = findHeaderKey(headers, SERVER_TIMING_HEADER);
    if (headers && key) {
      headers[key] = value;
    } else {
      response.setHeader('Server-Timing', value);
    }
  } catch (e) {
    DEBUG_BUILD && debug.warn('Failed to add the trace to the Server-Timing header', e);
  }
}
