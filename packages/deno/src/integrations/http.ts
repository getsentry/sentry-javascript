import { subscribe } from 'node:diagnostics_channel';
import { errorMonitor } from 'node:events';
import type { RequestOptions } from 'node:http';
import type {
  Event,
  HttpClientRequest,
  HttpIncomingMessage,
  HttpServerResponse,
  Integration,
  IntegrationFn,
  Span,
} from '@sentry/core';
import {
  DEFAULT_IGNORE_STATUS_CODES,
  defineIntegration,
  getHttpClientSubscriptions,
  getHttpServerSubscriptions,
  getRequestOptions,
  HTTP_ON_CLIENT_REQUEST,
  HTTP_ON_SERVER_REQUEST,
  processHttpServerTransactionEvent,
} from '@sentry/core';

const INTEGRATION_NAME = 'DenoHttp' as const;

export interface DenoHttpIntegrationOptions {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to create spans for incoming and outgoing HTTP requests.
   * Defaults to the client's tracing configuration (`hasSpansEnabled`).
   */
  spans?: boolean;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for
   * incoming requests to track the health and crash-free rate of your releases in Sentry.
   *
   * @default `true`
   */
  sessions?: boolean;

  /**
   * Number of milliseconds until sessions are flushed as a session aggregate.
   *
   * @default `60000` (60s)
   */
  sessionFlushingDelayMS?: number;

  /**
   * Whether to inject trace propagation headers (sentry-trace, baggage) into outgoing HTTP requests.
   *
   * When set to `false`, Sentry will not inject any trace propagation headers, but will still create breadcrumbs
   * (if `breadcrumbs` is enabled).
   *
   * @default `true`
   */
  tracePropagation?: boolean;

  /**
   * Whether to automatically ignore common static asset requests (favicon.ico, robots.txt, etc.)
   * when creating server spans.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   *
   * @default 'medium'
   */
  maxRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   *
   * The `request` parameter is the incoming `node:http` {@link IncomingMessage} — use `request.url`,
   * `request.method`, `request.headers`, etc.
   */
  ignoreRequestBody?: (url: string, request: HttpIncomingMessage) => boolean;

  /**
   * Do not capture server spans for incoming HTTP requests whose URL path makes the given callback return `true`.
   *
   * The `request` parameter is the incoming `node:http` {@link IncomingMessage} — use `request.url`,
   * `request.method`, `request.headers`, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;

  /**
   * Do not capture breadcrumbs, spans, or propagate trace headers for outgoing HTTP requests where the given callback returns `true`.
   *
   * The `request` parameter is the outgoing {@link RequestOptions} — use `request.hostname`, `request.path`,
   * `request.method`, `request.headers`, etc.
   */
  ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;

  /**
   * Do not send transaction events for incoming HTTP requests with the given status codes.
   * By default, some 3xx and 4xx status codes are dropped (see @default).
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * Filtering runs in `processEvent` on the finished transaction, not when the span is created,
   * so it also applies to `Deno.serve` transactions. Pass `[]` to keep everything.
   *
   * @default `[[401, 404], [301, 303], [305, 399]]`
   */
  ignoreStatusCodes?: (number | [number, number])[];

  /**
   * Called after the span for an outgoing request is created.
   * Use this to add custom attributes to the span.
   */
  outgoingRequestHook?: (span: Span, request: HttpClientRequest) => void;

  /**
   * Called when the response to an outgoing request is received.
   */
  outgoingResponseHook?: (span: Span, response: HttpIncomingMessage) => void;

  /**
   * Called once both the outgoing request and its response are available (after the response
   * ends). Useful for adding attributes based on both objects.
   */
  outgoingRequestApplyCustomAttributes?: (
    span: Span,
    request: HttpClientRequest,
    response: HttpIncomingMessage,
  ) => void;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  onSpanCreated?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;

  /**
   * A hook that can be used to mutate the span one last time when the response is finished.
   */
  onSpanEnd?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;
}

const _denoHttpIntegration = ((options: DenoHttpIntegrationOptions = {}) => {
  const breadcrumbs = options.breadcrumbs ?? true;
  const tracePropagation = options.tracePropagation ?? true;
  const ignoreStatusCodes = options.ignoreStatusCodes ?? DEFAULT_IGNORE_STATUS_CODES;

  return {
    name: INTEGRATION_NAME,
    processEvent(event: Event): Event | null {
      return processHttpServerTransactionEvent(event, ignoreStatusCodes);
    },
    setupOnce() {
      const { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequest } = getHttpServerSubscriptions({
        ...options,
        errorMonitor,
      });
      subscribe(HTTP_ON_SERVER_REQUEST, onHttpServerRequest);

      const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequest } = getHttpClientSubscriptions({
        ...options,
        breadcrumbs,
        tracePropagation,
        applyCustomAttributesOnSpan: options.outgoingRequestApplyCustomAttributes,
        ignoreOutgoingRequests: options.ignoreOutgoingRequests
          ? (url, request) => options.ignoreOutgoingRequests!(url, getRequestOptions(request))
          : undefined,
        // Deno doesn't run OTel's http instrumentation, so there's no
        // double-wrap to detect; skip the warning to avoid loading the module.
        suppressOtelWarning: true,
        errorMonitor,
      });
      subscribe(HTTP_ON_CLIENT_REQUEST, onHttpClientRequest);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments incoming and outgoing HTTP requests handled via the `node:http` module in Deno.
 *
 * Listens on Deno's `node:diagnostics_channel` for `http.server.request.start` and
 * `http.client.request.created`, then routes them through Sentry core's portable subscription
 * helpers (`getHttpServerSubscriptions`, `getHttpClientSubscriptions`) to create root server
 * spans, instrument client requests, and propagate distributed trace headers.
 *
 * For Deno-native `Deno.serve(...)` instrumentation, see {@link denoServeIntegration}.
 */
export const denoHttpIntegration = defineIntegration(_denoHttpIntegration) as (
  options?: DenoHttpIntegrationOptions,
) => Integration & {
  name: 'DenoHttp';
  setupOnce: () => void;
  processEvent: (event: Event) => Event | null;
};
