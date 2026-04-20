import { addBreadcrumb } from '../../breadcrumbs';
import { getBreadcrumbLogLevelFromHttpStatusCode } from '../../utils/breadcrumb-log-level';
import { getSanitizedUrlString, parseUrl } from '../../utils/url';
import { getRequestUrlFromClientRequest } from './get-request-url';
import type { HttpClientRequest, HttpIncomingMessage } from './types';

/**
 * Create a breadcrumb for a finished outgoing HTTP request.
 */
export function addOutgoingRequestBreadcrumb(
  request: HttpClientRequest,
  response: HttpIncomingMessage | undefined,
): void {
  const url = getRequestUrlFromClientRequest(request);
  const parsedUrl = parseUrl(url);

  const statusCode = response?.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        url: getSanitizedUrlString(parsedUrl),
        'http.method': request.method || 'GET',
        ...(parsedUrl.search ? { 'http.query': parsedUrl.search } : {}),
        ...(parsedUrl.hash ? { 'http.fragment': parsedUrl.hash } : {}),
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
