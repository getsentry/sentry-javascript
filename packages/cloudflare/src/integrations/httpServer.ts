import type { Client, IntegrationFn, MaxRequestBodySize } from '@sentry/core';
import { captureBodyFromWinterCGRequest, defineIntegration, getIsolationScope } from '@sentry/core';

const INTEGRATION_NAME = 'HttpServer';

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
}

interface HttpServerIntegrationInstance {
  name: string;
  maxRequestBodySize: MaxRequestBodySize;
  ignoreRequestBody?: (url: string, request: Request) => boolean;
}

const _httpServerIntegration = ((options: HttpServerIntegrationOptions = {}): HttpServerIntegrationInstance => {
  return {
    name: INTEGRATION_NAME,
    maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
    ignoreRequestBody: options.ignoreRequestBody,
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

  const maxRequestBodySize = integration.maxRequestBodySize;

  if (maxRequestBodySize === 'none') {
    return;
  }

  // Skip GET and HEAD requests - they don't have bodies
  // Also skip OPTIONS, even if they may have a body, they might not give a lot of extra value
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return;
  }

  if (integration.ignoreRequestBody?.(request.url, request)) {
    return;
  }

  const isolationScope = getIsolationScope();
  await captureBodyFromWinterCGRequest(request, isolationScope, maxRequestBodySize);
}
