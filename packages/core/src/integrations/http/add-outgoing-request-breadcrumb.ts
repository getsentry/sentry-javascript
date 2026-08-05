import { HTTP_METHOD, URL_FRAGMENT, URL_QUERY } from '@sentry/conventions/attributes';
import { addBreadcrumb } from '../../breadcrumbs';
import { getClient } from '../../currentScopes';
import { getBreadcrumbLogLevelFromHttpStatusCode } from '../../utils/breadcrumb-log-level';
import { filterQueryParams } from '../../utils/data-collection/filterQueryParams';
import { getSanitizedUrlString, getUrlFragment, getUrlQuery, parseUrl } from '../../utils/url';
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

  // Breadcrumbs never reach the span pipeline, so this is the only place the query gets filtered.
  const query = getUrlQuery(parsedUrl.search);
  const urlQueryParams = getClient()?.getDataCollectionOptions().urlQueryParams ?? true;

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        url: getSanitizedUrlString(parsedUrl),
        // eslint-disable-next-line typescript/no-deprecated
        [HTTP_METHOD]: request.method || 'GET',
        [URL_QUERY]: query && filterQueryParams(query, urlQueryParams),
        [URL_FRAGMENT]: getUrlFragment(parsedUrl.hash),
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
