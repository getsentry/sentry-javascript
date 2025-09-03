import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe } from 'node:diagnostics_channel';
import type { ClientRequest, IncomingMessage, RequestOptions, Server, ServerResponse } from 'node:http';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { instrumentServer } from './incoming-requests';

export interface HttpServerIntegrationOptions {
  /**
   * Whether to create spans for incoming requests or not.
   *
   * @default `true`
   */
  spans?: boolean;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming requests to track the health and crash-free rate of your releases in Sentry.
   * Read more about Release Health: https://docs.sentry.io/product/releases/health/
   *
   * Defaults to `true`.
   */
  sessions?: boolean;

  /**
   * Number of milliseconds until sessions tracked with `trackIncomingRequestsAsSessions` will be flushed as a session aggregate.
   *
   * Defaults to `60000` (60s).
   */
  sessionFlushingDelayMS?: number;

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
   * By default, spans with 404 status code are ignored.
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * @default `[[401, 404], [300, 399]]`
   */
  dropSpansForStatusCodes?: (number | [number, number])[];

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   * This can be useful for long running requests where the body is not needed and we want to avoid capturing it.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the incoming request.
   * @param request Contains the {@type RequestOptions} object used to make the incoming request.
   */
  ignoreRequestBody?: (url: string, request: RequestOptions) => boolean;

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
  maxRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

  /**
   * @deprecated This is deprecated in favor of `incomingRequestSpanHook`.
   */
  instrumentation?: {
    requestHook?: (span: Span, req: ClientRequest | IncomingMessage) => void;
    responseHook?: (span: Span, response: IncomingMessage | ServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: ClientRequest | IncomingMessage,
      response: IncomingMessage | ServerResponse,
    ) => void;
  };

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  onSpanCreated?: (span: Span, request: IncomingMessage, response: ServerResponse) => void;
}

/** Exported for direct, type-safe use in Http integration. */
export const _httpServerIntegration = ((options: HttpServerIntegrationOptions = {}) => {
  const _options = {
    spans: options.spans ?? true,
    sessions: options.sessions ?? true,
    ignoreStaticAssets: options.ignoreStaticAssets ?? true,
    sessionFlushingDelayMS: options.sessionFlushingDelayMS ?? 60_000,
    maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
    dropSpansForStatusCodes: options.dropSpansForStatusCodes ?? [
      [401, 404],
      [300, 399],
    ],
    ...options,
  };

  return {
    name: 'HttpServer',
    setupOnce() {
      const onHttpServerRequestStart = ((_data: unknown) => {
        const data = _data as { server: Server };

        instrumentServer(data.server, _options);
      }) satisfies ChannelListener;

      subscribe('http.server.request.start', onHttpServerRequestStart);
    },
    processEvent(event) {
      // Drop transaction if it has a status code that should be ignored
      if (event.type === 'transaction') {
        const statusCode = event.contexts?.trace?.data?.['http.response.status_code'];
        if (
          typeof statusCode === 'number' &&
          _options.dropSpansForStatusCodes.some(code => {
            if (typeof code === 'number') {
              return code === statusCode;
            }

            const [min, max] = code;
            return statusCode >= min && statusCode <= max;
          })
        ) {
          return null;
        }
      }

      return event;
    },
  };
}) satisfies IntegrationFn;

export const httpServerIntegration = defineIntegration(_httpServerIntegration);
