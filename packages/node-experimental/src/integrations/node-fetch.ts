import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { addBreadcrumb, defineIntegration } from '@sentry/core';
import { _INTERNAL, getSpanKind } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';
import { NODE_MAJOR } from '../nodeVersion';

import { addOriginToSpan } from '../utils/addOriginToSpan';

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

  function getInstrumentation(): [Instrumentation] | void {
    // Only add NodeFetch if Node >= 16, as previous versions do not support it
    if (NODE_MAJOR < 16) {
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FetchInstrumentation } = require('opentelemetry-instrumentation-fetch-node');
      return [
        new FetchInstrumentation({
          ignoreRequestHook: (request: { origin?: string }) => {
            const url = request.origin;
            return _ignoreOutgoingRequests && url && _ignoreOutgoingRequests(url);
          },

          onRequest: ({ span }: { span: Span }) => {
            _updateSpan(span);

            if (_breadcrumbs) {
              _addRequestBreadcrumb(span);
            }
          },
        }),
      ];
    } catch (error) {
      // Could not load instrumentation
    }
  }

  return {
    name: 'NodeFetch',
    setupOnce() {
      const instrumentations = getInstrumentation();

      if (instrumentations) {
        registerInstrumentations({
          instrumentations,
        });
      }
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

/** Update the span with data we need. */
function _updateSpan(span: Span): void {
  addOriginToSpan(span, 'auto.http.otel.node_fetch');
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(span: Span): void {
  if (getSpanKind(span) !== SpanKind.CLIENT) {
    return;
  }

  const data = _INTERNAL.getRequestSpanData(span);
  addBreadcrumb({
    category: 'http',
    data: {
      ...data,
    },
    type: 'http',
  });
}
