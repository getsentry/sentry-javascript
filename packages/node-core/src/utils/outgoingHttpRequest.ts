import type {  SanitizedRequestData } from '@sentry/core';
import {
  addBreadcrumb,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getSanitizedUrlString,
  parseUrl,
} from '@sentry/core';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'http';

/** Add a breadcrumb for outgoing requests. */
export function addRequestBreadcrumb(request: ClientRequest, response: IncomingMessage | undefined): void {
  const data = getBreadcrumbData(request);

  const statusCode = response?.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        ...data,
      },
      type: 'http',
      level,
    },
    {
      event: 'response',
      request,
      response,
    },
  );
}

function getBreadcrumbData(request: ClientRequest): Partial<SanitizedRequestData> {
  try {
    // `request.host` does not contain the port, but the host header does
    const host = request.getHeader('host') || request.host;
    const url = new URL(request.path, `${request.protocol}//${host}`);
    const parsedUrl = parseUrl(url.toString());

    const data: Partial<SanitizedRequestData> = {
      url: getSanitizedUrlString(parsedUrl),
      'http.method': request.method || 'GET',
    };

    if (parsedUrl.search) {
      data['http.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      data['http.fragment'] = parsedUrl.hash;
    }

    return data;
  } catch {
    return {};
  }
}

/** Convert an outgoing request to request options. */
export function getRequestOptions(request: ClientRequest): RequestOptions {
  return {
    method: request.method,
    protocol: request.protocol,
    host: request.host,
    hostname: request.host,
    path: request.path,
    headers: request.getHeaders(),
  };
}

/**
 *
 */
export function getClientRequestUrl(request: ClientRequest): string {
  const hostname = request.getHeader('host') || request.host;
  const protocol = request.protocol;
  const path = request.path;

  return `${protocol}//${hostname}${path}`;
}
