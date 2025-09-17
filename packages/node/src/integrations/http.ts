import type { ClientRequest, IncomingMessage, RequestOptions, ServerResponse } from 'node:http';
import { diag } from '@opentelemetry/api';
import type { HttpInstrumentationConfig } from '@opentelemetry/instrumentation-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { Span } from '@sentry/core';
import { debug, defineIntegration, getClient, hasSpansEnabled } from '@sentry/core';
import type { HTTPModuleRequestIncomingMessage, NodeClient } from '@sentry/node-core';
import {
  type SentryHttpInstrumentationOptions,
  addOriginToSpan,
  generateInstrumentOnce,
  getRequestUrl,
  NODE_VERSION,
  SentryHttpInstrumentation,
} from '@sentry/node-core';
import { DEBUG_BUILD } from '../debug-build';
import type { NodeClientOptions } from '../types';

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
   *
   * If `skipOpenTelemetrySetup: true` is configured, this defaults to `false`, otherwise it defaults to `true`.
   */
  spans?: boolean;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming requests to track the health and crash-free rate of your releases in Sentry.
   * Read more about Release Health: https://docs.sentry.io/product/releases/health/
   *
   * Defaults to `true`.
   */
  trackIncomingRequestsAsSessions?: boolean;

  /**
   * Number of milliseconds until sessions tracked with `trackIncomingRequestsAsSessions` will be flushed as a session aggregate.
   *
   * Defaults to `60000` (60s).
   */
  sessionFlushingDelayMS?: number;

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
   * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
   * This helps reduce noise in your transactions.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Do not capture spans for incoming HTTP requests with the given status codes.
   * By default, spans with some 3xx and 4xx status codes are ignored.
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * @default `[[401, 404], 301, 303, [305, 399]]`
   */
  dropSpansForIncomingRequestStatusCodes?: (number | [number, number])[];

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   * This can be useful for long running requests where the body is not needed and we want to avoid capturing it.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the incoming request.
   * @param request Contains the {@type RequestOptions} object used to make the incoming request.
   */
  ignoreIncomingRequestBody?: (url: string, request: RequestOptions) => boolean;

  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   *
   * Available options:
   * - 'none': No request bodies will be attached
   * - 'small': Request bodies up to 1,000 bytes will be attached
   * - 'medium': Request bodies up to 10,000 bytes will be attached (default)
   * - 'always': Request bodies will always be attached
   *
   * Note that even with 'always' setting, bodies exceeding 1MB will never be attached
   * for performance and security reasons.
   *
   * @default 'medium'
   */
  maxIncomingRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

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
  };
}

export const instrumentSentryHttp = generateInstrumentOnce<SentryHttpInstrumentationOptions>(
  `${INTEGRATION_NAME}.sentry`,
  options => {
    return new SentryHttpInstrumentation(options);
  },
);

export const instrumentOtelHttp = generateInstrumentOnce<HttpInstrumentationConfig>(INTEGRATION_NAME, config => {
  const instrumentation = new HttpInstrumentation({
    ...config,
    // This is hard-coded and can never be overridden by the user
    disableIncomingRequestInstrumentation: true,
  });

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

/** Exported only for tests. */
export function _shouldUseOtelHttpInstrumentation(
  options: HttpOptions,
  clientOptions: Partial<NodeClientOptions> = {},
): boolean {
  // If `spans` is passed in, it takes precedence
  // Else, we by default emit spans, unless `skipOpenTelemetrySetup` is set to `true` or spans are not enabled
  if (typeof options.spans === 'boolean') {
    return options.spans;
  }

  if (clientOptions.skipOpenTelemetrySetup) {
    return false;
  }

  // IMPORTANT: We only disable span instrumentation when spans are not enabled _and_ we are on Node 22+,
  // as otherwise the necessary diagnostics channel is not available yet
  if (!hasSpansEnabled(clientOptions) && NODE_VERSION.major >= 22) {
    return false;
  }

  return true;
}

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration((options: HttpOptions = {}) => {
  const dropSpansForIncomingRequestStatusCodes = options.dropSpansForIncomingRequestStatusCodes ?? [
    [401, 404],
    // 300, 302 and 304 are possibly valid status codes we do not want to filter
    301,
    303,
    [305, 399],
  ];

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const clientOptions = (getClient<NodeClient>()?.getOptions() || {}) as Partial<NodeClientOptions>;
      const useOtelHttpInstrumentation = _shouldUseOtelHttpInstrumentation(options, clientOptions);
      const disableIncomingRequestSpans = options.disableIncomingRequestSpans ?? !hasSpansEnabled(clientOptions);

      // This is Sentry-specific instrumentation for request isolation and breadcrumbs
      instrumentSentryHttp({
        ...options,
        disableIncomingRequestSpans,
        ignoreSpansForIncomingRequests: options.ignoreIncomingRequests,
        // If spans are not instrumented, it means the HttpInstrumentation has not been added
        // In that case, we want to handle trace propagation ourselves
        propagateTraceInOutgoingRequests: !useOtelHttpInstrumentation,
      });

      // This is the "regular" OTEL instrumentation that emits spans
      if (useOtelHttpInstrumentation) {
        const instrumentationConfig = getConfigWithDefaults(options);
        instrumentOtelHttp(instrumentationConfig);
      }
    },
    processEvent(event) {
      // Drop transaction if it has a status code that should be ignored
      if (event.type === 'transaction') {
        const statusCode = event.contexts?.trace?.data?.['http.response.status_code'];
        if (typeof statusCode === 'number') {
          const shouldDrop = shouldFilterStatusCode(statusCode, dropSpansForIncomingRequestStatusCodes);
          if (shouldDrop) {
            DEBUG_BUILD && debug.log('Dropping transaction due to status code', statusCode);
            return null;
          }
        }
      }

      return event;
    },
  };
});

function getConfigWithDefaults(options: Partial<HttpOptions> = {}): HttpInstrumentationConfig {
  const instrumentationConfig = {
    ignoreOutgoingRequestHook: request => {
      const url = getRequestUrl(request);

      if (!url) {
        return false;
      }

      const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;
      if (_ignoreOutgoingRequests?.(url, request)) {
        return true;
      }

      return false;
    },

    requireParentforOutgoingSpans: false,
    requestHook: (span, req) => {
      addOriginToSpan(span, 'auto.http.otel.http');

      options.instrumentation?.requestHook?.(span, req);
    },
    responseHook: (span, res) => {
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

/**
 * If the given status code should be filtered for the given list of status codes/ranges.
 */
function shouldFilterStatusCode(statusCode: number, dropForStatusCodes: (number | [number, number])[]): boolean {
  return dropForStatusCodes.some(code => {
    if (typeof code === 'number') {
      return code === statusCode;
    }

    const [min, max] = code;
    return statusCode >= min && statusCode <= max;
  });
}
