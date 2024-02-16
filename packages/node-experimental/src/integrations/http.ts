import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import { addBreadcrumb, defineIntegration, getIsolationScope, isSentryRequestUrl } from '@sentry/core';
import { _INTERNAL, getClient, getSpanKind, setSpanMetadata } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

import { setIsolationScope } from '../sdk/scope';
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
            _updateSpan(span, req);

            // Update the isolation scope, isolate this request
            if (getSpanKind(span) === SpanKind.SERVER) {
              const isolationScope = getIsolationScope().clone();
              isolationScope.setSDKProcessingMetadata({ request: req });
              isolationScope.setRequestSession({ status: 'ok' });
              setIsolationScope(isolationScope);
            }
          },
          responseHook: (span, res) => {
            if (_breadcrumbs) {
              _addRequestBreadcrumb(span, res);
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

export const httpIntegration = defineIntegration(_httpIntegration);

/** Update the span with data we need. */
function _updateSpan(span: Span, request: ClientRequest | IncomingMessage): void {
  addOriginToSpan(span, 'auto.http.otel.http');

  if (getSpanKind(span) === SpanKind.SERVER) {
    setSpanMetadata(span, { request });
  }
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(span: Span, response: IncomingMessage | ServerResponse): void {
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
