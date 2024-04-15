import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { addBreadcrumb, defineIntegration } from '@sentry/core';
import { getRequestSpanData, getSpanKind } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
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

  async function getInstrumentation(): Promise<[Instrumentation] | void> {
    // Only add NodeFetch if Node >= 18, as previous versions do not support it
    if (NODE_MAJOR < 18) {
      DEBUG_BUILD && logger.log('NodeFetch is not supported on Node < 18, skipping instrumentation...');
      return;
    }

    try {
      const pkg = await import('opentelemetry-instrumentation-fetch-node');
      return [
        new pkg.FetchInstrumentation({
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ];
    } catch (error) {
      // Could not load instrumentation
      DEBUG_BUILD && logger.log('Could not load NodeFetch instrumentation.');
    }
  }

  return {
    name: 'NodeFetch',
    setupOnce() {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      getInstrumentation().then(instrumentations => {
        if (instrumentations) {
          registerInstrumentations({
            instrumentations,
          });
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
function _addRequestBreadcrumb(span: Span): void {
  if (getSpanKind(span) !== SpanKind.CLIENT) {
    return;
  }

  const data = getRequestSpanData(span);
  addBreadcrumb({
    category: 'http',
    data: {
      ...data,
    },
    type: 'http',
  });
}
