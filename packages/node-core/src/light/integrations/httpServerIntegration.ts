import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe } from 'node:diagnostics_channel';
import type { IncomingMessage, RequestOptions, Server } from 'node:http';
import type { Integration, IntegrationFn } from '@sentry/core';
import {
  continueTrace,
  debug,
  generateSpanId,
  getCurrentScope,
  getIsolationScope,
  httpRequestToRequestData,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { patchRequestToCaptureBody } from '../../utils/captureRequestBody';
import type { LightNodeClient } from '../client';

const INTEGRATION_NAME = 'Http.Server';

// We keep track of emit functions we wrapped, to avoid double wrapping
const wrappedEmitFns = new WeakSet<typeof Server.prototype.emit>();

export interface HttpServerIntegrationOptions {
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

const _httpServerIntegration = ((options: HttpServerIntegrationOptions = {}) => {
  const _options = {
    maxRequestBodySize: options.maxRequestBodySize ?? 'medium',
    ignoreRequestBody: options.ignoreRequestBody,
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const onHttpServerRequestStart = ((_data: unknown) => {
        const data = _data as { server: Server };

        instrumentServer(data.server, _options);
      }) satisfies ChannelListener;

      subscribe('http.server.request.start', onHttpServerRequestStart);
    },
  };
}) satisfies IntegrationFn;

/**
 * This integration handles request isolation and trace continuation for incoming http requests
 * in light mode (without OpenTelemetry).
 *
 * This is a lightweight alternative to the OpenTelemetry-based httpServerIntegration.
 * It uses Node's native AsyncLocalStorage for scope isolation and Sentry's continueTrace for propagation.
 *
 * Note: This integration requires Node.js 22+ (for http.server.request.start diagnostics channel).
 *
 * @see {@link ../../integrations/http/httpServerIntegration.ts} for the OpenTelemetry-based version
 */
export const httpServerIntegration = _httpServerIntegration as (
  options?: HttpServerIntegrationOptions,
) => Integration & {
  name: 'Http.Server';
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

      DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Handling incoming request (light mode)');

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
        // Set a new propagationSpanId for this request
        // We rely on the fact that `withIsolationScope()` will implicitly also fork the current scope
        // This way we can save an "unnecessary" `withScope()` invocation
        getCurrentScope().getPropagationContext().propagationSpanId = generateSpanId();

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
            return target.apply(thisArg, args);
          },
        );
      });
    },
  });

  wrappedEmitFns.add(newEmit);
  server.emit = newEmit;
}
