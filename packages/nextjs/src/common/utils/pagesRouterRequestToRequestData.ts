import type { RequestEventData } from '@sentry/core';
import { httpRequestToRequestData, parseUrl } from '@sentry/core';
import type { IncomingMessage } from 'http';

const NEXT_REQUEST_META = Symbol.for('NextInternalRequestMeta');

type RequestWithNextMeta = IncomingMessage & {
  [NEXT_REQUEST_META]?: { initURL?: unknown };
};

/**
 * Converts a Pages Router request into request data for events.
 *
 * Next.js strips `basePath` from `req.url` before running pages and API routes, but keeps the URL as it was originally
 * requested in its internal request meta (`initURL`). We use that one so the reported URL matches what was requested.
 */
export function pagesRouterRequestToRequestData(req: RequestWithNextMeta): RequestEventData {
  const requestData = httpRequestToRequestData(req);

  const initUrl = req[NEXT_REQUEST_META]?.initURL;
  // `initURL` can be absolute, but its origin is built from the Next.js server's own hostname and port rather than the
  // request headers, so we only keep path and query and let the headers decide the origin like everywhere else.
  const originalUrl = typeof initUrl === 'string' ? parseUrl(initUrl).relative : undefined;
  if (!originalUrl || originalUrl === req.url) {
    return requestData;
  }

  const { url, query_string } = httpRequestToRequestData({
    url: originalUrl,
    headers: req.headers,
    socket: req.socket,
  });

  return { ...requestData, url, query_string };
}
