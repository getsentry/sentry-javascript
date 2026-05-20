import { subscribe } from 'node:diagnostics_channel';
import { errorMonitor } from 'node:events';
import type { ClientRequest, RequestOptions } from 'node:http';
import type { HttpIncomingMessage, Integration, IntegrationFn, Span } from '@sentry/core';
import {
  debug,
  defineIntegration,
  getHttpClientSubscriptions,
  getHttpServerSubscriptions,
  getRequestOptions,
  HTTP_ON_CLIENT_REQUEST,
  HTTP_ON_SERVER_REQUEST,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';
import {
  DENO_VERSION,
  HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED,
  HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED,
} from '../denoVersion';

const INTEGRATION_NAME = 'DenoHttp';

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
   * Hook invoked after the server span is created but before the request is handled.
   */
  onIncomingSpanCreated?: (span: Span, request: unknown, response: unknown) => void;

  /**
   * Hook invoked when the server span ends, before it is recorded.
   */
  onIncomingSpanEnd?: (span: Span, request: unknown, response: unknown) => void;
}

const _denoHttpIntegration = ((options: DenoHttpIntegrationOptions = {}) => {
  const breadcrumbs = options.breadcrumbs ?? true;
  const tracePropagation = options.tracePropagation ?? true;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const denoVersion = DENO_VERSION.major !== undefined ? `${Deno.version.deno}` : 'unknown';

      // Below 2.7.13 neither channel fires. Warn and bail without touching the ACS.
      if (!HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED && !HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED) {
        debug.warn(
          `denoHttpIntegration requires Deno 2.7.13+ (client) or 2.8.0+ (server) for node:http diagnostics channels; running on Deno ${denoVersion}. The integration is a no-op on this version.`,
        );
        return;
      }

      // Wire up Deno's AsyncLocalStorage-backed ACS so the server subscription's
      // `withIsolationScope(clone, ...)` actually activates the cloned scope.
      // Without this, request isolation and span creation degrade silently.
      setAsyncLocalStorageAsyncContextStrategy();

      if (HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED) {
        const { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequest } = getHttpServerSubscriptions({
          // `spans` falls through to the client's tracing config when unset.
          spans: options.spans,
          ignoreStaticAssets: options.ignoreStaticAssets,
          ignoreIncomingRequests: options.ignoreIncomingRequests,
          maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
          ignoreRequestBody: options.ignoreRequestBody,
          onSpanCreated: options.onIncomingSpanCreated,
          onSpanEnd: options.onIncomingSpanEnd,
          errorMonitor,
          sessions: false,
        });
        subscribe(HTTP_ON_SERVER_REQUEST, onHttpServerRequest);
      } else {
        debug.log(
          `denoHttpIntegration: server-side instrumentation requires Deno 2.8.0+; running on Deno ${denoVersion}. Client-side instrumentation is still active.`,
        );
      }

      if (HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED) {
        const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequest } = getHttpClientSubscriptions({
          spans: options.spans,
          breadcrumbs,
          propagateTrace: tracePropagation,
          ignoreOutgoingRequests: options.ignoreOutgoingRequests
            ? (url, request) => options.ignoreOutgoingRequests!(url, getRequestOptions(request as ClientRequest))
            : undefined,
          // Deno doesn't run OTel's http instrumentation, so there's no
          // double-wrap to detect; skip the warning to avoid loading the module.
          suppressOtelWarning: true,
          errorMonitor,
        });
        subscribe(HTTP_ON_CLIENT_REQUEST, onHttpClientRequest);
      }
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
) => Integration & { name: 'DenoHttp'; setupOnce: () => void };
