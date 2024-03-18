import type { ServerResponse } from 'http';
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import { addBreadcrumb, defineIntegration, getIsolationScope, isSentryRequestUrl } from '@sentry/core';
import { _INTERNAL, getClient, getSpanKind } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

import type { NodeClient } from '../sdk/client';
import { setIsolationScope } from '../sdk/scope';
import type { HTTPModuleRequestIncomingMessage } from '../transports/http-module';
import { addOriginToSpan } from '../utils/addOriginToSpan';
import { getRequestUrl } from '../utils/getRequestUrl';

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;

  /**
   * Do not capture spans or breadcrumbs for incoming HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreIncomingRequests?: (url: string) => boolean;
}

const _httpIntegration = ((options: HttpOptions = {}) => {
  const _breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
  const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;
  const _ignoreIncomingRequests = options.ignoreIncomingRequests;

  return {
    name: 'Http',
    setupOnce() {
      const instrumentations = [
        new HttpInstrumentation({
          ignoreOutgoingRequestHook: request => {
            const url = getRequestUrl(request);

            if (!url) {
              return false;
            }

            if (isSentryRequestUrl(url, getClient())) {
              return true;
            }

            if (_ignoreOutgoingRequests && _ignoreOutgoingRequests(url)) {
              return true;
            }

            return false;
          },

          ignoreIncomingRequestHook: request => {
            const url = getRequestUrl(request);

            const method = request.method?.toUpperCase();
            // We do not capture OPTIONS/HEAD requests as transactions
            if (method === 'OPTIONS' || method === 'HEAD') {
              return true;
            }

            if (_ignoreIncomingRequests && _ignoreIncomingRequests(url)) {
              return true;
            }

            return false;
          },

          requireParentforOutgoingSpans: true,
          requireParentforIncomingSpans: false,
          requestHook: (span, req) => {
            _updateSpan(span);

            // Update the isolation scope, isolate this request
            if (getSpanKind(span) === SpanKind.SERVER) {
              const isolationScope = getIsolationScope().clone();
              isolationScope.setSDKProcessingMetadata({ request: req });

              const client = getClient<NodeClient>();
              if (client && client.getOptions().autoSessionTracking) {
                isolationScope.setRequestSession({ status: 'ok' });
              }
              setIsolationScope(isolationScope);
            }
          },
          responseHook: (span, res) => {
            if (_breadcrumbs) {
              _addRequestBreadcrumb(span, res);
            }

            const client = getClient<NodeClient>();
            if (client && client.getOptions().autoSessionTracking) {
              setImmediate(() => {
                client['_captureRequestSession']();
              });
            }
          },
        }),
      ];

      registerInstrumentations({
        instrumentations,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration(_httpIntegration);

/** Update the span with data we need. */
function _updateSpan(span: Span): void {
  addOriginToSpan(span, 'auto.http.otel.http');
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(span: Span, response: HTTPModuleRequestIncomingMessage | ServerResponse): void {
  if (getSpanKind(span) !== SpanKind.CLIENT) {
    return;
  }

  const data = _INTERNAL.getRequestSpanData(span);
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
      // TODO FN: Do we need access to `request` here?
      // If we do, we'll have to use the `applyCustomAttributesOnSpan` hook instead,
      // but this has worse context semantics than request/responseHook.
      response,
    },
  );
}
