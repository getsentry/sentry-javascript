import type { Client, Integration, IntegrationFn, MaxRequestBodySize, Span } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { AssertTrue, CheckServerRequestOptions, ServerRequestOptions } from '@sentry/core/server';

const INTEGRATION_NAME = 'HttpServer' as const;

export interface HttpServerIntegrationOptions {
  /**
   * Controls the maximum size of incoming request bodies attached to events.
   *
   * Only applies to requests with textual content types (text/*, application/json,
   * application/x-www-form-urlencoded, application/xml, application/graphql).
   * Binary data is not captured.
   *
   * Available options:
   * - `'none'`: No request bodies will be attached
   * - `'small'`: Request bodies up to 1,000 bytes will be attached
   * - `'medium'`: Request bodies up to 10,000 bytes will be attached (default)
   * - `'always'`: Request bodies will always be attached (up to 1MB limit)
   *
   * @default 'medium'
   */
  maxRequestBodySize?: MaxRequestBodySize;

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   * This can be useful for long running requests where the body is not needed, health check endpoints,
   * or requests containing sensitive data that should not be captured.
   *
   * @param url The full URL of the incoming request, including query string, protocol, host, etc.
   * @param request The incoming Request object.
   * @returns `true` to skip body capture for this request, `false` to capture normally.
   *
   * @example
   * ```ts
   * Sentry.httpServerIntegration({
   *   ignoreRequestBody: (url) => url.includes('/health') || url.includes('/upload'),
   * })
   * ```
   */
  ignoreRequestBody?: (url: string, request: Request) => boolean;

  /**
   * Do not create spans for incoming requests whose URL path makes the given callback return `true`.
   *
   * `urlPath` is the path of the request, including the query string. `request` is the incoming
   * {@link Request}. Errors thrown by the handler are still captured.
   */
  ignoreIncomingRequests?: (urlPath: string, request: Request) => boolean;

  /**
   * Whether to automatically ignore common static asset requests (favicon.ico, robots.txt, etc.)
   * when creating spans.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Whether to create spans for incoming requests.
   * Errors are still captured and request data is still attached when this is `false`.
   * Defaults to the client's tracing configuration (`hasSpansEnabled`).
   */
  spans?: boolean;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, before the request handler runs.
   */
  onSpanCreated?: (span: Span, request: Request) => void;

  /**
   * A hook that can be used to mutate the span one last time before it ends.
   * For a streamed response, this runs when the stream finishes.
   * It is not called when the request handler throws.
   */
  onSpanEnd?: (span: Span, request: Request, response: Response) => void;
}

// Checks these options against the shared `ServerRequestOptions`. A new
// shared field fails to compile here, until this integration supports
// it or lists it as unsupported.
type _ServerRequestOptionsCheck = AssertTrue<
  CheckServerRequestOptions<
    HttpServerIntegrationOptions,
    Request,
    Response,
    // Not supported. A worker has no long-lived process to run the timer
    // that flushes session aggregates.
    'sessions' | 'sessionFlushingDelayMS'
  >
>;

type SupportedServerRequestOptions = Omit<
  ServerRequestOptions<Request, Response>,
  'sessions' | 'sessionFlushingDelayMS'
>;

// Every supported shared option is a required key, so a new one fails to compile below until the
// integration passes it on.
type HttpServerRequestOptions = {
  [K in keyof Required<SupportedServerRequestOptions>]: SupportedServerRequestOptions[K];
};

interface HttpServerIntegration extends Integration {
  requestOptions: HttpServerRequestOptions;
}

/**
 * The incoming request options of the client's `httpServerIntegration`. Without the integration,
 * the SDK attaches no request body, so users can turn body capture off by removing it.
 */
export function getHttpServerRequestOptions(client: Client): ServerRequestOptions<Request, Response> {
  return (
    client.getIntegrationByName<HttpServerIntegration>(INTEGRATION_NAME)?.requestOptions ?? {
      maxRequestBodySize: 'none',
    }
  );
}

const _httpServerIntegration = ((options: HttpServerIntegrationOptions = {}): HttpServerIntegration => {
  return {
    name: INTEGRATION_NAME,
    requestOptions: {
      maxRequestBodySize: options.maxRequestBodySize,
      ignoreRequestBody: options.ignoreRequestBody,
      ignoreIncomingRequests: options.ignoreIncomingRequests,
      ignoreStaticAssets: options.ignoreStaticAssets ?? true,
      spans: options.spans,
      onSpanCreated: options.onSpanCreated,
      onSpanEnd: options.onSpanEnd,
    },
  };
}) satisfies IntegrationFn;

/**
 * Configures incoming HTTP request handling for Cloudflare Workers.
 *
 * This integration controls how incoming HTTP request data is captured,
 * matching the API of `httpServerIntegration` in Node.js.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.httpServerIntegration({
 *       maxRequestBodySize: 'medium',
 *       ignoreRequestBody: (url) => url.includes('/health'),
 *     }),
 *   ],
 * });
 * ```
 */
export const httpServerIntegration = defineIntegration(_httpServerIntegration);
