import { subscribe } from 'node:diagnostics_channel';
import { context, trace } from '@opentelemetry/api';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { HttpClientRequest, HttpIncomingMessage, HttpInstrumentationOptions, Span } from '@sentry/core';
import {
  getHttpClientSubscriptions,
  patchHttpModuleClient,
  getRequestOptions,
  isTracingSuppressed,
} from '@sentry/core';
import { HTTP_ON_CLIENT_REQUEST } from '@sentry/core';
import { NODE_VERSION } from '../../nodeVersion';
import { errorMonitor } from 'node:events';
import * as http from 'node:http';

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL =
  (NODE_VERSION.major === 22 && NODE_VERSION.minor >= 12) ||
  (NODE_VERSION.major === 23 && NODE_VERSION.minor >= 2) ||
  NODE_VERSION.major >= 24;

export interface OutgoingHttpRequestInstrumentationOptions {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to create spans for outgoing requests.
   *
   * @default `true`
   */
  spans?: boolean;

  /**
   * Whether to propagate Sentry trace headers in outgoing requests.
   *
   * @default `true`
   */
  propagateTrace?: boolean;

  /**
   * Do not instrument outgoing HTTP requests to URLs where the given callback returns `true`.
   * When it returns `true`, the request is skipped entirely: no breadcrumb and no span are created,
   * and no trace headers are propagated for that request.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * Hooks for outgoing request spans, only called when spans are created for outgoing requests
   * (i.e. when `spans` is enabled).
   */
  outgoingRequestHook?: (span: Span, request: ClientRequest | HttpClientRequest) => void;
  outgoingResponseHook?: (span: Span, response: IncomingMessage | HttpIncomingMessage) => void;
  outgoingRequestApplyCustomAttributes?: (
    span: Span,
    request: HttpClientRequest,
    response: HttpIncomingMessage,
  ) => void;
}

/**
 * This instruments the http modules for outgoing requests.
 * It uses the diagnostics channel if available, otherwise it falls back to monkey-patching.
 *
 * The instrumentation will start spans, create breadcrumbs, and propagate trace headers in outgoing requests (depending on the settings).
 */
export function instrumentHttpOutgoingRequests(
  instrumentationOptions: OutgoingHttpRequestInstrumentationOptions = {},
): void {
  const { outgoingRequestApplyCustomAttributes: applyCustomAttributesOnSpan, ...options } = instrumentationOptions;
  const patchOptions = {
    applyCustomAttributesOnSpan,
    ...options,
    propagateTrace: options.propagateTrace ?? true,
    spans: options.spans ?? true,
    ignoreOutgoingRequests(url, request) {
      return isTracingSuppressed() || !!options.ignoreOutgoingRequests?.(url, getRequestOptions(request));
    },
    outgoingRequestHook(span, request) {
      options.outgoingRequestHook?.(span, request);
      // We monkey-patch `req.once('response'), which is used to trigger
      // the callback of the request, so that it runs in the active context
      // eslint-disable-next-line @typescript-eslint/unbound-method, typescript/no-deprecated
      const originalOnce = request.once;

      const newOnce = new Proxy(originalOnce, {
        apply(target, thisArg, args: Parameters<typeof originalOnce>) {
          const [event] = args;
          if (event !== 'response') {
            return target.apply(thisArg, args);
          }

          const parentContext = context.active();
          const requestContext = trace.setSpan(parentContext, span);

          return context.with(requestContext, () => {
            return target.apply(thisArg, args);
          });
        },
      });

      // eslint-disable-next-line typescript/no-deprecated
      request.once = newOnce;
    },
    outgoingResponseHook(span, response) {
      options.outgoingResponseHook?.(span, response);
    },
    errorMonitor,
    // Pass these in to detect OTel double-wrapping if we're enabling spans
    http,
  } satisfies HttpInstrumentationOptions;

  if (FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL) {
    instrumentHttpOutgoingRequestsViaChannel(patchOptions);
  } else {
    instrumentHttpOutgoingRequestsViaMonkeyPatching(patchOptions);
  }
}

function instrumentHttpOutgoingRequestsViaChannel(options: HttpInstrumentationOptions): void {
  const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = getHttpClientSubscriptions(options);
  subscribe(HTTP_ON_CLIENT_REQUEST, onHttpClientRequestCreated);
}

/**
 * Instrument outgoing HTTP(S) requests by old-school monkey-patching the `http` module.
 * This is the fallback for runtimes that do not fully support the `node:http` client diagnostics channel
 * (Node < 22.12).
 */
function instrumentHttpOutgoingRequestsViaMonkeyPatching(options: HttpInstrumentationOptions): void {
  // Patching http also patches https, as this uses the same underlying object
  patchHttpModuleClient(http, options);
}
