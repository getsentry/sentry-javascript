import { subscribe } from 'node:diagnostics_channel';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { context, createContextKey, propagation } from '@opentelemetry/api';
import type { HttpInstrumentationOptions, Integration, IntegrationFn } from '@sentry/core';
import {
  _INTERNAL_safeMathRandom,
  addNonEnumerableProperty,
  debug,
  getClient,
  getHttpServerSubscriptions,
  HTTP_ON_SERVER_REQUEST,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

// Inlining this type to not depend on newer TS types
interface WeakRefImpl<T> {
  deref(): T | undefined;
}

type StartSpanCallback = (next: () => void) => void;
type RequestWithOptionalStartSpanCallback = IncomingMessage & {
  _startSpanCallback?: WeakRefImpl<StartSpanCallback>;
};

const HTTP_SERVER_INSTRUMENTED_KEY = createContextKey('sentry_http_server_instrumented');
const INTEGRATION_NAME = 'Http.Server';

export interface HttpServerIntegrationOptions {
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
}

/**
 * Add a callback to the request object that will be called when the request is started.
 * The callback will receive the next function to continue processing the request.
 */
export function addStartSpanCallback(request: RequestWithOptionalStartSpanCallback, callback: StartSpanCallback): void {
  addNonEnumerableProperty(request, '_startSpanCallback', new WeakRef(callback));
}

const _httpServerIntegration = ((options: HttpServerIntegrationOptions = {}) => {
  const _options: HttpInstrumentationOptions = {
    ...options,
    sessions: options.sessions ?? true,
    sessionFlushingDelayMS: options.sessionFlushingDelayMS ?? 60_000,
    maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
    wrapServerEmitRequest(request, response, normalizedRequest, next) {
      const ctx = propagation
        .extract(context.active(), normalizedRequest.headers)
        .setValue(HTTP_SERVER_INSTRUMENTED_KEY, true);

      const client = getClient();
      if (!client) return next();

      return context.with(ctx, () => {
        // This is used (optionally) by the httpServerSpansIntegration to attach _startSpanCallback to the request object
        client.emit('httpServerRequest', request, response, normalizedRequest);

        const callback = (request as RequestWithOptionalStartSpanCallback)._startSpanCallback?.deref();
        return callback ? callback(() => next()) : next();
      });
    },
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequestStart } = getHttpServerSubscriptions(_options);
      subscribe(HTTP_ON_SERVER_REQUEST, onHttpServerRequestStart);
    },
    afterAllSetup(client) {
      if (DEBUG_BUILD && client.getIntegrationByName('Http')) {
        debug.warn(
          'It seems that you have manually added `httpServerIntegration` while `httpIntegration` is also present. Make sure to remove `httpServerIntegration` when adding `httpIntegration`.',
        );
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * This integration handles request isolation, trace continuation and other core Sentry functionality around incoming http requests
 * handled via the node `http` module.
 *
 * This version uses OpenTelemetry for context propagation and span management.
 *
 * @see {@link ../../light/integrations/httpServerIntegration.ts} for the lightweight version without OpenTelemetry
 */
export const httpServerIntegration = _httpServerIntegration as (
  options?: HttpServerIntegrationOptions,
) => Integration & {
  name: 'HttpServer';
  setupOnce: () => void;
};
