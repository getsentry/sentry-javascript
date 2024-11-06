import type { ClientRequest, IncomingMessage, RequestOptions, ServerResponse } from 'node:http';
import { diag } from '@opentelemetry/api';
import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import { defineIntegration } from '@sentry/core';
import { getClient } from '@sentry/opentelemetry';
import type { IntegrationFn, Span } from '@sentry/types';

import { generateInstrumentOnce } from '../../otel/instrument';
import type { NodeClient } from '../../sdk/client';
import type { HTTPModuleRequestIncomingMessage } from '../../transports/http-module';
import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { getRequestUrl } from '../../utils/getRequestUrl';
import { SentryHttpInstrumentation } from './SentryHttpInstrumentation';

const INTEGRATION_NAME = 'Http';

const INSTRUMENTATION_NAME = '@opentelemetry_sentry-patched/instrumentation-http';

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
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
   * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
   * Spans will be non recording if tracing is disabled.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   * For example: `'/users/details?id=123'`
   *
   * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;

  /**
   * If true, do not generate spans for incoming requests at all.
   * This is used by Remix to avoid generating spans for incoming requests, as it generates its own spans.
   */
  disableIncomingRequestSpans?: boolean;

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
     * You can pass any configuration through to the underlying instrumentation.
     * Note that there are no semver guarantees for this!
     */
    _experimentalConfig?: ConstructorParameters<typeof HttpInstrumentation>[0];
  };
}

export const instrumentSentryHttp = generateInstrumentOnce<{
  breadcrumbs?: HttpOptions['breadcrumbs'];
  ignoreOutgoingRequests?: HttpOptions['ignoreOutgoingRequests'];
}>(`${INTEGRATION_NAME}.sentry`, options => {
  return new SentryHttpInstrumentation({
    breadcrumbs: options?.breadcrumbs,
    ignoreOutgoingRequests: options?.ignoreOutgoingRequests,
  });
});

export const instrumentOtelHttp = generateInstrumentOnce<HttpInstrumentationConfig>(INTEGRATION_NAME, config => {
  const instrumentation = new HttpInstrumentation(config);

  // We want to update the logger namespace so we can better identify what is happening here
  try {
    instrumentation['_diag'] = diag.createComponentLogger({
      namespace: INSTRUMENTATION_NAME,
    });
    // @ts-expect-error We are writing a read-only property here...
    instrumentation.instrumentationName = INSTRUMENTATION_NAME;
  } catch {
    // ignore errors here...
  }

  return instrumentation;
});

/**
 * Instrument the HTTP and HTTPS modules.
 */
const instrumentHttp = (options: HttpOptions = {}): void => {
  // This is the "regular" OTEL instrumentation that emits spans
  if (options.spans !== false) {
    const instrumentationConfig = getConfigWithDefaults(options);
    instrumentOtelHttp(instrumentationConfig);
  }

  // This is the Sentry-specific instrumentation that isolates requests & creates breadcrumbs
  // Note that this _has_ to be wrapped after the OTEL instrumentation,
  // otherwise the isolation will not work correctly
  instrumentSentryHttp(options);
};

const _httpIntegration = ((options: HttpOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentHttp(options);
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

function getConfigWithDefaults(options: Partial<HttpOptions> = {}): HttpInstrumentationConfig {
  const instrumentationConfig = {
    ...options.instrumentation?._experimentalConfig,

    disableIncomingRequestInstrumentation: options.disableIncomingRequestSpans,

    ignoreOutgoingRequestHook: request => {
      const url = getRequestUrl(request);

      if (!url) {
        return false;
      }

      const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;
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

      const _ignoreIncomingRequests = options.ignoreIncomingRequests;
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

      options.instrumentation?.requestHook?.(span, req);
    },
    responseHook: (span, res) => {
      const client = getClient<NodeClient>();
      if (client && client.getOptions().autoSessionTracking) {
        setImmediate(() => {
          client['_captureRequestSession']();
        });
      }

      options.instrumentation?.responseHook?.(span, res);
    },
    applyCustomAttributesOnSpan: (
      span: Span,
      request: ClientRequest | HTTPModuleRequestIncomingMessage,
      response: HTTPModuleRequestIncomingMessage | ServerResponse,
    ) => {
      options.instrumentation?.applyCustomAttributesOnSpan?.(span, request, response);
    },
  } satisfies HttpInstrumentationConfig;

  return instrumentationConfig;
}
