import type { UndiciRequest, UndiciResponse } from '@opentelemetry/instrumentation-undici';
import { addBreadcrumb, defineIntegration } from '@sentry/core';

import type { Integration, IntegrationFn, SanitizedRequestData } from '@sentry/types';
import { getBreadcrumbLogLevelFromHttpStatusCode, getSanitizedUrlString, parseUrl } from '@sentry/utils';
import * as diagnosticsChannel from 'diagnostics_channel';
import type { NodeClient } from '../sdk/client';

type OldIntegration = Integration & { breadcrumbsDisabled: boolean };

interface NodeFetchOptions {
  /**
   * Do not capture breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   */
  ignore?: (url: string) => boolean;
}

const _fetchBreadcrumbsIntegration = ((options: NodeFetchOptions = {}) => {
  function onRequestHeaders({ request, response }: { request: UndiciRequest; response: UndiciResponse }): void {
    if (options.ignore) {
      const url = getAbsoluteUrl(request.origin, request.path);
      const shouldIgnore = options.ignore(url);

      if (shouldIgnore) {
        return;
      }
    }

    addRequestBreadcrumb(request, response);
  }

  return {
    name: 'FetchBreadcrumbs',
    setup: (client: NodeClient) => {
      if (client.getOptions().fetchBreadcrumbs === false) {
        return;
      }

      // We need to ensure all other integrations have been setup first
      setImmediate(() => {
        const oldIntegration = client.getIntegrationByName<OldIntegration>('NodeFetch');
        if (oldIntegration?.breadcrumbsDisabled) {
          return;
        }

        diagnosticsChannel
          .channel('undici:request:headers')
          // eslint-disable-next-line deprecation/deprecation
          .subscribe(onRequestHeaders as diagnosticsChannel.ChannelListener);
      });
    },
  };
}) satisfies IntegrationFn;

export const fetchBreadcrumbsIntegration = defineIntegration(_fetchBreadcrumbsIntegration);

/** Add a breadcrumb for outgoing requests. */
function addRequestBreadcrumb(request: UndiciRequest, response: UndiciResponse): void {
  const data = getBreadcrumbData(request);
  const statusCode = response.statusCode;
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

function getBreadcrumbData(request: UndiciRequest): Partial<SanitizedRequestData> {
  try {
    const url = new URL(request.path, request.origin);
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

// Matching the behavior of the base instrumentation
function getAbsoluteUrl(origin: string, path: string = '/'): string {
  const url = `${origin}`;

  if (url.endsWith('/') && path.startsWith('/')) {
    return `${url}${path.slice(1)}`;
  }

  if (!url.endsWith('/') && !path.startsWith('/')) {
    return `${url}/${path.slice(1)}`;
  }

  return `${url}${path}`;
}
