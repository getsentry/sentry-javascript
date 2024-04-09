import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import {
  addBreadcrumb,
  defineIntegration,
  getCapturedScopesOnSpan,
  getCurrentScope,
  getIsolationScope,
  isSentryRequestUrl,
  setCapturedScopesOnSpan,
  spanToJSON,
} from '@sentry/core';
import { getClient, getRequestSpanData, getSpanKind } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

import { stripUrlQueryAndFragment } from '@sentry/utils';
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
            addOriginToSpan(span, 'auto.http.otel.http');

            // both, incoming requests and "client" requests made within the app trigger the requestHook
            // we only want to isolate and further annotate incoming requests (IncomingMessage)
            if (_isClientRequest(req)) {
              return;
            }

            const scopes = getCapturedScopesOnSpan(span);

            // Update the isolation scope, isolate this request
            const isolationScope = (scopes.isolationScope || getIsolationScope()).clone();
            const scope = scopes.scope || getCurrentScope();

            isolationScope.setSDKProcessingMetadata({ request: req });

            const client = getClient<NodeClient>();
            if (client && client.getOptions().autoSessionTracking) {
              isolationScope.setRequestSession({ status: 'ok' });
            }
            setIsolationScope(isolationScope);
            setCapturedScopesOnSpan(span, scope, isolationScope);

            // attempt to update the scope's `transactionName` based on the request URL
            // Ideally, framework instrumentations coming after the HttpInstrumentation
            // update the transactionName once we get a parameterized route.
            const attributes = spanToJSON(span).data;
            if (!attributes) {
              return;
            }

            const httpMethod = String(attributes['http.method']).toUpperCase() || 'GET';
            const httpTarget = stripUrlQueryAndFragment(String(attributes['http.target'])) || '/';
            const bestEffortTransactionName = `${httpMethod} ${httpTarget}`;

            isolationScope.setTransactionName(bestEffortTransactionName);
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

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(span: Span, response: HTTPModuleRequestIncomingMessage | ServerResponse): void {
  if (getSpanKind(span) !== SpanKind.CLIENT) {
    return;
  }

  const data = getRequestSpanData(span);
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

/**
 * Determines if @param req is a ClientRequest, meaning the request was created within the express app
 * and it's an outgoing request.
 * Checking for properties instead of using `instanceOf` to avoid importing the request classes.
 */
function _isClientRequest(req: ClientRequest | IncomingMessage): req is ClientRequest {
  return 'outputData' in req && 'outputSize' in req && !('client' in req) && !('statusCode' in req);
}
