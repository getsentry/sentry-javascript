import type { Client, IntegrationFn, MaxRequestBodySize, Span } from '@sentry/core';
import {
  captureBodyFromWinterCGRequest,
  defineIntegration,
  getIsolationScope,
  hasSpansEnabled,
  parseStringToURLObject,
  safeCallback,
} from '@sentry/core';
import type { AssertTrue, CheckServerRequestOptions } from '@sentry/core/server';
import { isStaticAssetRequest } from '@sentry/core/server';
import { DEBUG_BUILD } from '../debug-build';

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

interface HttpServerIntegrationInstance extends HttpServerIntegrationOptions {
  name: string;
  maxRequestBodySize: MaxRequestBodySize | undefined;
}

const _httpServerIntegration = ((options: HttpServerIntegrationOptions = {}): HttpServerIntegrationInstance => {
  return {
    name: INTEGRATION_NAME,
    maxRequestBodySize: options.maxRequestBodySize,
    ignoreRequestBody: options.ignoreRequestBody,
    ignoreIncomingRequests: options.ignoreIncomingRequests,
    ignoreStaticAssets: options.ignoreStaticAssets ?? true,
    spans: options.spans,
    onSpanCreated: options.onSpanCreated,
    onSpanEnd: options.onSpanEnd,
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

/**
 * Capture the request body based on the HttpServer integration config.
 * Called internally by `wrapRequestHandler`.
 */
export async function captureIncomingRequestBody(client: Client, request: Request): Promise<void> {
  const integration = client.getIntegrationByName<HttpServerIntegrationInstance>(INTEGRATION_NAME);

  if (!integration) {
    return;
  }

  const configuredBodySize = integration.maxRequestBodySize;
  const effectiveBodySize: MaxRequestBodySize =
    configuredBodySize ??
    (client.getDataCollectionOptions().httpBodies.includes('incomingRequest') ? 'medium' : 'none');

  if (effectiveBodySize === 'none') {
    return;
  }

  // Skip GET and HEAD requests - they don't have bodies
  // Also skip OPTIONS, even if they may have a body, they might not give a lot of extra value
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return;
  }

  const ignoreRequestBody = integration.ignoreRequestBody;
  if (
    ignoreRequestBody &&
    // If the filter throws, skip the body so it cannot leak data the filter was meant to hide.
    safeCallback(
      DEBUG_BUILD ? 'Error in `ignoreRequestBody`, skipping the body:' : '',
      () => ignoreRequestBody(request.url, request),
      () => true,
    )
  ) {
    return;
  }

  const isolationScope = getIsolationScope();
  await captureBodyFromWinterCGRequest(request, isolationScope, effectiveBodySize);
}

/**
 * Whether to create a span for the incoming request, based on the HttpServer integration config.
 * Called internally by `wrapRequestHandler`.
 */
export function shouldCreateIncomingRequestSpan(client: Client | undefined, request: Request): boolean {
  if (!client) {
    return false;
  }

  const integration = client.getIntegrationByName<HttpServerIntegrationInstance>(INTEGRATION_NAME);
  if (!(integration?.spans ?? hasSpansEnabled(client.getOptions()))) {
    return false;
  }

  const urlObject = parseStringToURLObject(request.url);
  const urlPath = urlObject ? `${urlObject.pathname}${urlObject.search}` : '/';
  if (integration?.ignoreStaticAssets && request.method === 'GET' && isStaticAssetRequest(urlPath)) {
    return false;
  }

  const ignoreIncomingRequests = integration?.ignoreIncomingRequests;
  return !(
    ignoreIncomingRequests &&
    safeCallback(
      DEBUG_BUILD ? 'Error in `ignoreIncomingRequests`, creating the span:' : '',
      () => ignoreIncomingRequests(urlPath, request),
      () => false,
    )
  );
}

/**
 * The `onSpanCreated` and `onSpanEnd` hooks of the HttpServer integration, guarded so that a hook
 * that throws does not fail the request. Called internally by `wrapRequestHandler`.
 */
export function getIncomingRequestSpanHooks(client: Client | undefined): {
  onSpanCreated: (span: Span, request: Request) => void;
  onSpanEnd: (span: Span, request: Request, response: Response) => void;
} {
  const integration = client?.getIntegrationByName<HttpServerIntegrationInstance>(INTEGRATION_NAME);
  return {
    onSpanCreated: (span, request) =>
      safeCallback(
        DEBUG_BUILD ? 'Error in `onSpanCreated`:' : '',
        () => integration?.onSpanCreated?.(span, request),
        () => undefined,
      ),
    onSpanEnd: (span, request, response) =>
      safeCallback(
        DEBUG_BUILD ? 'Error in `onSpanEnd`:' : '',
        () => integration?.onSpanEnd?.(span, request, response),
        () => undefined,
      ),
  };
}
