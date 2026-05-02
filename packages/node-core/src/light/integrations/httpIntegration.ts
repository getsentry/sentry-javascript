import { subscribe } from 'node:diagnostics_channel';
import type { RequestOptions } from 'node:http';
import type { HttpClientRequest, HttpIncomingMessage, Integration, IntegrationFn } from '@sentry/core';
import {
  addOutgoingRequestBreadcrumb,
  continueTrace,
  debug,
  generateSpanId,
  getCurrentScope,
  getHttpClientSubscriptions,
  getIsolationScope,
  HTTP_ON_CLIENT_REQUEST,
  httpRequestToRequestData,
  stripUrlQueryAndFragment,
  SUPPRESS_TRACING_KEY,
  withIsolationScope,
  getRequestOptions,
  getRequestUrlFromClientRequest,
} from '@sentry/core';
import type { ClientRequest, IncomingMessage, Server } from 'node:http';
import { DEBUG_BUILD } from '../../debug-build';
import { patchRequestToCaptureBody } from '../../utils/captureRequestBody';
import type { LightNodeClient } from '../client';
import { errorMonitor } from 'node:events';
import { NODE_VERSION } from '../../nodeVersion';

const INTEGRATION_NAME = 'Http';

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL =
  (NODE_VERSION.major === 22 && NODE_VERSION.minor >= 12) ||
  (NODE_VERSION.major === 23 && NODE_VERSION.minor >= 2) ||
  NODE_VERSION.major >= 24;

// We keep track of emit functions we wrapped, to avoid double wrapping
const wrappedEmitFns = new WeakSet<typeof Server.prototype.emit>();

export interface HttpIntegrationOptions {
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
   * Whether breadcrumbs should be recorded for outgoing requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to inject trace propagation headers (sentry-trace, baggage, traceparent) into outgoing HTTP requests.
   *
   * When set to `false`, Sentry will not inject any trace propagation headers, but will still create breadcrumbs
   * (if `breadcrumbs` is enabled).
   *
   * @default `true`
   */
  tracePropagation?: boolean;

  /**
   * Do not capture breadcrumbs or propagate trace headers for outgoing HTTP requests to URLs
   * where the given callback returns `true`.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;
}

const _httpIntegration = ((options: HttpIntegrationOptions = {}) => {
  const _options = {
    ...options,
    sessions: false,
    maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
    ignoreRequestBody: options.ignoreRequestBody,
    breadcrumbs: options.breadcrumbs ?? true,
    tracePropagation: options.tracePropagation ?? true,
    ignoreOutgoingRequests: options.ignoreOutgoingRequests,
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const onHttpServerRequestStart = (_data: unknown) => {
        const data = _data as { server: Server };
        instrumentServer(data.server, _options);
      };

      const { ignoreOutgoingRequests } = _options;

      const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = getHttpClientSubscriptions({
        breadcrumbs: _options.breadcrumbs,
        propagateTrace: _options.tracePropagation,
        ignoreOutgoingRequests: ignoreOutgoingRequests
          ? (url, request) => ignoreOutgoingRequests(url, getRequestOptions(request as ClientRequest))
          : undefined,
        // No spans in light mode
        // means we don't have pass modules to detect OTel double-wrap
        spans: false,
        errorMonitor,
      });

      subscribe('http.server.request.start', onHttpServerRequestStart);

      // Subscribe on the request creation in node versions that support it
      subscribe(HTTP_ON_CLIENT_REQUEST, onHttpClientRequestCreated);

      // fall back to just doing breadcrumbs on the request.end() channel
      // if we do not have earlier access to the request object at creation
      // time. The http.client.request.error channel is only available on
      // the same node versions as client.request.created, so no help.
      if (_options.breadcrumbs && !FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL) {
        subscribe('http.client.request.start', (data: unknown) => {
          const { request } = data as { request: HttpClientRequest };
          request.on(errorMonitor, () => onOutgoingResponseFinish(request, undefined, _options));
          request.prependListener('response', response => {
            if (request.listenerCount('response') <= 1) {
              response.resume();
            }
            onOutgoingResponseFinish(request, response, _options);
          });
        });
      }
    },
  };
}) satisfies IntegrationFn;

function onOutgoingResponseFinish(
  request: HttpClientRequest,
  response: HttpIncomingMessage | undefined,
  options: {
    breadcrumbs: boolean;
    ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;
  },
): void {
  if (!options.breadcrumbs) {
    return;
  }
  // Check if tracing is suppressed (e.g. for Sentry's own transport requests)
  if (getCurrentScope().getScopeData().sdkProcessingMetadata[SUPPRESS_TRACING_KEY]) {
    return;
  }
  const { ignoreOutgoingRequests } = options;
  if (ignoreOutgoingRequests) {
    const url = getRequestUrlFromClientRequest(request as ClientRequest);
    if (ignoreOutgoingRequests(url, getRequestOptions(request as ClientRequest))) {
      return;
    }
  }
  addOutgoingRequestBreadcrumb(request, response);
}

/**
 * This integration handles incoming and outgoing HTTP requests in light mode (without OpenTelemetry).
 *
 * It uses Node's native diagnostics channels (Node.js 22+) for request isolation,
 * trace propagation, and breadcrumb creation.
 */
export const httpIntegration = _httpIntegration as (options?: HttpIntegrationOptions) => Integration & {
  name: 'Http';
  setupOnce: () => void;
};

/**
 * Instrument a server to capture incoming requests.
 */
function instrumentServer(
  server: Server,
  {
    ignoreRequestBody,
    maxRequestBodySize,
  }: {
    ignoreRequestBody?: (url: string, request: IncomingMessage) => boolean;
    maxRequestBodySize: 'small' | 'medium' | 'always' | 'none';
  },
): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalEmit: typeof Server.prototype.emit = server.emit;

  if (wrappedEmitFns.has(originalEmit)) {
    return;
  }

  const newEmit = new Proxy(originalEmit, {
    apply(target, thisArg, args: [event: string, ...args: unknown[]]) {
      // Only handle request events
      if (args[0] !== 'request') {
        return target.apply(thisArg, args);
      }

      const client = getCurrentScope().getClient<LightNodeClient>();

      if (!client) {
        return target.apply(thisArg, args);
      }

      DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Handling incoming request');

      const isolationScope = getIsolationScope().clone();
      const request = args[1] as IncomingMessage;

      const normalizedRequest = httpRequestToRequestData(request);

      // request.ip is non-standard but some frameworks set this
      const ipAddress = (request as { ip?: string }).ip || request.socket?.remoteAddress;

      const url = request.url || '/';
      if (maxRequestBodySize !== 'none' && !ignoreRequestBody?.(url, request)) {
        patchRequestToCaptureBody(request, isolationScope, maxRequestBodySize, INTEGRATION_NAME);
      }

      // Update the isolation scope, isolate this request
      isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress });

      // attempt to update the scope's `transactionName` based on the request URL
      // Ideally, framework instrumentations coming after the HttpInstrumentation
      // update the transactionName once we get a parameterized route.
      const httpMethod = (request.method || 'GET').toUpperCase();
      const httpTargetWithoutQueryFragment = stripUrlQueryAndFragment(url);

      const bestEffortTransactionName = `${httpMethod} ${httpTargetWithoutQueryFragment}`;

      isolationScope.setTransactionName(bestEffortTransactionName);

      return withIsolationScope(isolationScope, () => {
        // Handle trace propagation using Sentry's continueTrace
        // This replaces OpenTelemetry's propagation.extract() + context.with()
        const sentryTrace = normalizedRequest.headers?.['sentry-trace'];
        const baggage = normalizedRequest.headers?.['baggage'];

        return continueTrace(
          {
            sentryTrace: Array.isArray(sentryTrace) ? sentryTrace[0] : sentryTrace,
            baggage: Array.isArray(baggage) ? baggage[0] : baggage,
          },
          () => {
            // Set propagationSpanId after continueTrace because it calls withScope +
            // setPropagationContext internally, which would overwrite any previously set value.
            getCurrentScope().getPropagationContext().propagationSpanId = generateSpanId();
            return target.apply(thisArg, args);
          },
        );
      });
    },
  });

  wrappedEmitFns.add(newEmit);
  server.emit = newEmit;
}
