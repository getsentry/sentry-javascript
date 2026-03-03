import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe } from 'node:diagnostics_channel';
import type { ClientRequest, IncomingMessage, RequestOptions, Server } from 'node:http';
import type { Integration, IntegrationFn } from '@sentry/core';
import {
  continueTrace,
  debug,
  generateSpanId,
  getCurrentScope,
  getIsolationScope,
  httpRequestToRequestData,
  LRUMap,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { patchRequestToCaptureBody } from '../../utils/captureRequestBody';
import {
  addRequestBreadcrumb,
  addTracePropagationHeadersToOutgoingRequest,
  getRequestOptions,
} from '../../utils/outgoingHttpRequest';
import type { LightNodeClient } from '../client';

const INTEGRATION_NAME = 'Http';

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
    maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
    ignoreRequestBody: options.ignoreRequestBody,
    breadcrumbs: options.breadcrumbs ?? true,
    ignoreOutgoingRequests: options.ignoreOutgoingRequests,
  };

  const propagationDecisionMap = new LRUMap<string, boolean>(100);
  const ignoreOutgoingRequestsMap = new WeakMap<ClientRequest, boolean>();

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const onHttpServerRequestStart = ((_data: unknown) => {
        const data = _data as { server: Server };
        instrumentServer(data.server, _options);
      }) satisfies ChannelListener;

      const onHttpClientRequestCreated = ((_data: unknown) => {
        const data = _data as { request: ClientRequest };
        onOutgoingRequestCreated(data.request, _options, propagationDecisionMap, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      const onHttpClientResponseFinish = ((_data: unknown) => {
        const data = _data as { request: ClientRequest; response: IncomingMessage };
        onOutgoingRequestFinish(data.request, data.response, _options, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      const onHttpClientRequestError = ((_data: unknown) => {
        const data = _data as { request: ClientRequest };
        onOutgoingRequestFinish(data.request, undefined, _options, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      subscribe('http.server.request.start', onHttpServerRequestStart);
      subscribe('http.client.request.created', onHttpClientRequestCreated);
      subscribe('http.client.response.finish', onHttpClientResponseFinish);
      subscribe('http.client.request.error', onHttpClientRequestError);
    },
  };
}) satisfies IntegrationFn;

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

function onOutgoingRequestCreated(
  request: ClientRequest,
  options: { ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean },
  propagationDecisionMap: LRUMap<string, boolean>,
  ignoreOutgoingRequestsMap: WeakMap<ClientRequest, boolean>,
): void {
  const shouldIgnore = shouldIgnoreOutgoingRequest(request, options);
  ignoreOutgoingRequestsMap.set(request, shouldIgnore);

  if (shouldIgnore) {
    return;
  }

  addTracePropagationHeadersToOutgoingRequest(request, propagationDecisionMap);
}

function onOutgoingRequestFinish(
  request: ClientRequest,
  response: IncomingMessage | undefined,
  options: {
    breadcrumbs: boolean;
    ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;
  },
  ignoreOutgoingRequestsMap: WeakMap<ClientRequest, boolean>,
): void {
  if (!options.breadcrumbs) {
    return;
  }

  // Note: We cannot rely on the map being set by `onOutgoingRequestCreated`, because that channel
  // only exists since Node 22
  const shouldIgnore = ignoreOutgoingRequestsMap.get(request) ?? shouldIgnoreOutgoingRequest(request, options);

  if (shouldIgnore) {
    return;
  }

  addRequestBreadcrumb(request, response);
}

/** Check if the given outgoing request should be ignored. */
function shouldIgnoreOutgoingRequest(
  request: ClientRequest,
  options: { ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean },
): boolean {
  // Check if tracing is suppressed (e.g. for Sentry's own transport requests)
  if (getCurrentScope().getScopeData().sdkProcessingMetadata.__SENTRY_SUPPRESS_TRACING__) {
    return true;
  }

  const { ignoreOutgoingRequests } = options;

  if (!ignoreOutgoingRequests) {
    return false;
  }

  const url = `${request.protocol}//${request.getHeader('host') || request.host}${request.path}`;
  return ignoreOutgoingRequests(url, getRequestOptions(request));
}
