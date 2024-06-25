import type { Span } from '@opentelemetry/api';
import { addBreadcrumb, defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn, SanitizedRequestData } from '@sentry/types';
import { getSanitizedUrlString, logger, parseUrl } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { NODE_MAJOR } from '../nodeVersion';

import type { FetchInstrumentation } from 'opentelemetry-instrumentation-fetch-node';

import { addOriginToSpan } from '../utils/addOriginToSpan';

interface FetchRequest {
  method: string;
  origin: string;
  path: string;
  headers: string | string[];
}

interface FetchResponse {
  headers: Buffer[];
  statusCode: number;
}

interface NodeFetchOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  const _breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
  const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;

  async function getInstrumentation(): Promise<FetchInstrumentation | void> {
    // Only add NodeFetch if Node >= 18, as previous versions do not support it
    if (NODE_MAJOR < 18) {
      DEBUG_BUILD && logger.log('NodeFetch is not supported on Node < 18, skipping instrumentation...');
      return;
    }

    try {
      const pkg = await import('opentelemetry-instrumentation-fetch-node');
      const { FetchInstrumentation } = pkg;

      class SentryNodeFetchInstrumentation extends FetchInstrumentation {
        // We extend this method so we have access to request _and_ response for the breadcrumb
        public onHeaders({ request, response }: { request: FetchRequest; response: FetchResponse }): void {
          if (_breadcrumbs) {
            _addRequestBreadcrumb(request, response);
          }

          return super.onHeaders({ request, response });
        }
      }

      return new SentryNodeFetchInstrumentation({
        ignoreRequestHook: (request: { origin?: string }) => {
          const url = request.origin;
          return _ignoreOutgoingRequests && url && _ignoreOutgoingRequests(url);
        },
        onRequest: ({ span }: { span: Span }) => {
          _updateSpan(span);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch (error) {
      // Could not load instrumentation
      DEBUG_BUILD && logger.log('Error while loading NodeFetch instrumentation: \n', error);
    }
  }

  return {
    name: 'NodeFetch',
    setupOnce() {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      getInstrumentation().then(instrumentation => {
        if (instrumentation) {
          addOpenTelemetryInstrumentation(instrumentation);
        }
      });
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

/** Update the span with data we need. */
function _updateSpan(span: Span): void {
  addOriginToSpan(span, 'auto.http.otel.node_fetch');
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(request: FetchRequest, response: FetchResponse): void {
  const data = getBreadcrumbData(request);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: response.statusCode,
        ...data,
      },
      type: 'http',
    },
    {
      event: 'response',
      request,
      response,
    },
  );
}

function getBreadcrumbData(request: FetchRequest): Partial<SanitizedRequestData> {
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
