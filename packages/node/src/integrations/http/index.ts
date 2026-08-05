import type { RequestOptions } from 'node:http';
import type { HttpClientRequest, HttpIncomingMessage, HttpServerResponse, Span } from '@sentry/core';
import { URL_FULL } from '@sentry/conventions/attributes';
import {
  defineIntegration,
  getRequestUrlFromClientRequest,
  hasSpansEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  stripDataUrlContent,
} from '@sentry/core';
import type { NodeClient } from '../../sdk/client';
import type { HttpServerIntegrationOptions } from './httpServerIntegration';
import { httpServerIntegration } from './httpServerIntegration';
import type { HttpServerSpansIntegrationOptions } from './httpServerSpansIntegration';
import { httpServerSpansIntegration } from './httpServerSpansIntegration';
import type { SentryHttpInstrumentationOptions } from './SentryHttpInstrumentation';
import { instrumentHttpOutgoingRequests } from './SentryHttpInstrumentation';

const INTEGRATION_NAME = 'Http' as const;

// TODO(v11): Consolidate all the various HTTP integration options into one,
// and deprecate the duplicated and aliased options.
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
   * Defaults to `true` when tracing is enabled.
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
   * Whether to inject trace propagation headers (sentry-trace, baggage, traceparent) into outgoing HTTP requests.
   *
   * When set to `false`, Sentry will not inject any trace propagation headers, but will still create breadcrumbs
   * (if `breadcrumbs` is enabled). This is useful when you run your own OpenTelemetry `HttpInstrumentation` and
   * want to avoid duplicate trace headers being injected by both Sentry and OpenTelemetry.
   *
   * @default `true`
   */
  tracePropagation?: boolean;

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
  ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  incomingRequestSpanHook?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;

  /**
   * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
   * This helps reduce noise in your transactions.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Do not capture spans for incoming HTTP requests with the given status codes.
   * By default, spans with some 3xx and 4xx status codes are ignored (see @default).
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * @default `[[401, 404], [301, 303], [305, 399]]`
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
    requestHook?: (span: Span, req: HttpIncomingMessage | HttpClientRequest) => void;
    responseHook?: (span: Span, response: HttpIncomingMessage | HttpServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: HttpIncomingMessage | HttpClientRequest,
      response: HttpIncomingMessage | HttpServerResponse,
    ) => void;
  };
}

export const instrumentSentryHttp = Object.assign(instrumentHttpOutgoingRequests, {
  id: `${INTEGRATION_NAME}.sentry`,
});

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration((options: HttpOptions = {}) => {
  const spans = options.spans ?? true;
  const disableIncomingRequestSpans = options.disableIncomingRequestSpans;
  const enableServerSpans = spans && !disableIncomingRequestSpans;

  const serverOptions = {
    sessions: options.trackIncomingRequestsAsSessions,
    sessionFlushingDelayMS: options.sessionFlushingDelayMS,
    ignoreRequestBody: options.ignoreIncomingRequestBody,
    maxRequestBodySize: options.maxIncomingRequestBodySize,
  } satisfies HttpServerIntegrationOptions;

  const serverSpansOptions: HttpServerSpansIntegrationOptions = {
    ignoreIncomingRequests: options.ignoreIncomingRequests,
    ignoreStaticAssets: options.ignoreStaticAssets,
    ignoreStatusCodes: options.dropSpansForIncomingRequestStatusCodes,
    // oxlint-disable-next-line typescript/no-deprecated -- pass through the deprecated option for back-compat
    instrumentation: options.instrumentation,
    onSpanCreated: options.incomingRequestSpanHook,
  };

  const server = httpServerIntegration(serverOptions);
  const serverSpans = httpServerSpansIntegration(serverSpansOptions);

  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      const clientOptions = client.getOptions();

      if (enableServerSpans && hasSpansEnabled(clientOptions)) {
        serverSpans.setup(client);
      }
    },
    setupOnce() {
      server.setupOnce();

      const sentryHttpInstrumentationOptions: SentryHttpInstrumentationOptions = {
        breadcrumbs: options.breadcrumbs,
        spans,
        propagateTraceInOutgoingRequests: options.tracePropagation ?? true,
        // oxlint-disable-next-line typescript/no-deprecated -- deprecated alias kept until removal
        createSpansForOutgoingRequests: spans,
        ignoreOutgoingRequests: options.ignoreOutgoingRequests,
        outgoingRequestHook: (span: Span, request: HttpClientRequest) => {
          // Sanitize data URLs to prevent long base64 strings in span attributes
          const url = getRequestUrlFromClientRequest(request);
          if (url.startsWith('data:')) {
            const sanitizedUrl = stripDataUrlContent(url);
            span.updateName(`${request.method || 'GET'} ${sanitizedUrl}`);
            span.setAttributes({
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [URL_FULL]: sanitizedUrl,
            });
          }
          options.instrumentation?.requestHook?.(span, request);
        },
        outgoingResponseHook: options.instrumentation?.responseHook,
        outgoingRequestApplyCustomAttributes: options.instrumentation?.applyCustomAttributesOnSpan,
      };

      // This is Sentry-specific instrumentation for outgoing request
      // breadcrumbs & trace propagation. It uses the diagnostic channels on
      // node versions that support it, falling back to monkey-patching when
      // needed.
      instrumentHttpOutgoingRequests(sentryHttpInstrumentationOptions);
    },
    processEvent(event) {
      // Always run this, even if spans are disabled
      // The reason being that e.g. the remix integration disables span
      // creation here but still wants to use the ignore status codes option
      return serverSpans.processEvent(event);
    },
  };
});
