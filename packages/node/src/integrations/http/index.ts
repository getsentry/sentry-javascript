import type { ClientRequest, IncomingMessage, RequestOptions, ServerResponse } from 'node:http';
import { diag } from '@opentelemetry/api';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';

import { defineIntegration } from '@sentry/core';
import { getClient } from '@sentry/opentelemetry';
import type { IntegrationFn, Span } from '@sentry/types';

import type { NodeClient } from '../../sdk/client';
import type { HTTPModuleRequestIncomingMessage } from '../../transports/http-module';
import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { getRequestUrl } from '../../utils/getRequestUrl';
import { SentryHttpInstrumentation } from './SentryHttpInstrumentation';

const INTEGRATION_NAME = 'Http';

const INSTRUMENTATION_NAME = '@opentelemetry_sentry-patched/instrumentation-http';

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * If set to false, do not emit any spans.
   * This will ensure that the default HttpInstrumentation from OpenTelemetry is not setup,
   * only the Sentry-specific instrumentation for request isolation is applied.
   */
  spans?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   *
   * The `url` param contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * For example: `'https://someService.com/users/details?id=123'`
   *
   * The `request` param contains the original {@type RequestOptions} object used to make the outgoing request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;

  /**
   * Do not capture spans or breadcrumbs for incoming HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   * For example: `'/users/details?id=123'`
   *
   * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;

  /**
   * Additional instrumentation options that are passed to the underlying HttpInstrumentation.
   */
  instrumentation?: {
    requestHook?: (span: Span, req: ClientRequest | HTTPModuleRequestIncomingMessage) => void;
    responseHook?: (span: Span, response: HTTPModuleRequestIncomingMessage | ServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: ClientRequest | HTTPModuleRequestIncomingMessage,
      response: HTTPModuleRequestIncomingMessage | ServerResponse,
    ) => void;

    /**
     * You can pass any configuration through to the underlying instrumention.
     * Note that there are no semver guarantees for this!
     */
    _experimentalConfig?: ConstructorParameters<typeof HttpInstrumentation>[0];
  };

  /** Allows to pass a custom version of HttpInstrumentation. We use this for Next.js. */
  _instrumentation?: typeof HttpInstrumentation;
}

let _httpOptions: HttpOptions = {};
let _sentryHttpInstrumentation: SentryHttpInstrumentation | undefined;
let _httpInstrumentation: HttpInstrumentation | undefined;

/**
 * Instrument the HTTP module.
 * This can only be instrumented once! If this called again later, we just update the options.
 */
export const instrumentHttp = Object.assign(
  function (): void {
    // This is the "regular" OTEL instrumentation that emits spans
    if (_httpOptions.spans !== false && !_httpInstrumentation) {
      const _InstrumentationClass = _httpOptions._instrumentation || HttpInstrumentation;

      _httpInstrumentation = new _InstrumentationClass({
        ..._httpOptions.instrumentation?._experimentalConfig,
        ignoreOutgoingRequestHook: request => {
          const url = getRequestUrl(request);

          if (!url) {
            return false;
          }

          const _ignoreOutgoingRequests = _httpOptions.ignoreOutgoingRequests;
          if (_ignoreOutgoingRequests && _ignoreOutgoingRequests(url, request)) {
            return true;
          }

          return false;
        },

        ignoreIncomingRequestHook: request => {
          // request.url is the only property that holds any information about the url
          // it only consists of the URL path and query string (if any)
          const urlPath = request.url;

          const method = request.method?.toUpperCase();
          // We do not capture OPTIONS/HEAD requests as transactions
          if (method === 'OPTIONS' || method === 'HEAD') {
            return true;
          }

          const _ignoreIncomingRequests = _httpOptions.ignoreIncomingRequests;
          if (urlPath && _ignoreIncomingRequests && _ignoreIncomingRequests(urlPath, request)) {
            return true;
          }

          return false;
        },

        requireParentforOutgoingSpans: false,
        requireParentforIncomingSpans: false,
        requestHook: (span, req) => {
          addOriginToSpan(span, 'auto.http.otel.http');
          if (!_isClientRequest(req) && isKnownPrefetchRequest(req)) {
            span.setAttribute('sentry.http.prefetch', true);
          }

          _httpOptions.instrumentation?.requestHook?.(span, req);
        },
        responseHook: (span, res) => {
          const client = getClient<NodeClient>();
          if (client && client.getOptions().autoSessionTracking) {
            setImmediate(() => {
              client['_captureRequestSession']();
            });
          }

          _httpOptions.instrumentation?.responseHook?.(span, res);
        },
        applyCustomAttributesOnSpan: (
          span: Span,
          request: ClientRequest | HTTPModuleRequestIncomingMessage,
          response: HTTPModuleRequestIncomingMessage | ServerResponse,
        ) => {
          _httpOptions.instrumentation?.applyCustomAttributesOnSpan?.(span, request, response);
        },
      });

      // We want to update the logger namespace so we can better identify what is happening here
      try {
        _httpInstrumentation['_diag'] = diag.createComponentLogger({
          namespace: INSTRUMENTATION_NAME,
        });
        // @ts-expect-error We are writing a read-only property here...
        _httpInstrumentation.instrumentationName = INSTRUMENTATION_NAME;
      } catch {
        // ignore errors here...
      }

      addOpenTelemetryInstrumentation(_httpInstrumentation);
    } else if (_httpOptions.spans === false && _httpInstrumentation) {
      _httpInstrumentation.disable();
    }

    // This is our custom instrumentation that is responsible for request isolation etc.
    // We have to add it after the OTEL instrumentation to ensure that we wrap the already wrapped http module
    // Otherwise, the isolation scope does not encompass the OTEL spans
    if (!_sentryHttpInstrumentation) {
      _sentryHttpInstrumentation = new SentryHttpInstrumentation({ breadcrumbs: _httpOptions.breadcrumbs });
      addOpenTelemetryInstrumentation(_sentryHttpInstrumentation);
    } else {
      _sentryHttpInstrumentation.setConfig({ breadcrumbs: _httpOptions.breadcrumbs });
    }
  },
  {
    id: INTEGRATION_NAME,
  },
);

const _httpIntegration = ((options: HttpOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _httpOptions = options;
      instrumentHttp();
    },
  };
}) satisfies IntegrationFn;

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration(_httpIntegration);

/**
 * Determines if @param req is a ClientRequest, meaning the request was created within the express app
 * and it's an outgoing request.
 * Checking for properties instead of using `instanceOf` to avoid importing the request classes.
 */
function _isClientRequest(req: ClientRequest | HTTPModuleRequestIncomingMessage): req is ClientRequest {
  return 'outputData' in req && 'outputSize' in req && !('client' in req) && !('statusCode' in req);
}

/**
 * Detects if an incoming request is a prefetch request.
 */
function isKnownPrefetchRequest(req: HTTPModuleRequestIncomingMessage): boolean {
  // Currently only handles Next.js prefetch requests but may check other frameworks in the future.
  return req.headers['next-router-prefetch'] === '1';
}
