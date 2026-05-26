import { subscribe } from 'node:diagnostics_channel';
import type { RequestOptions } from 'node:http';
import type { HttpClientRequest, HttpIncomingMessage, Integration, IntegrationFn } from '@sentry/core';
import {
  addOutgoingRequestBreadcrumb,
  getCurrentScope,
  getHttpClientSubscriptions,
  getHttpServerSubscriptions,
  getRequestOptions,
  getRequestUrlFromClientRequest,
  HTTP_ON_CLIENT_REQUEST,
  HTTP_ON_SERVER_REQUEST,
  SUPPRESS_TRACING_KEY,
} from '@sentry/core';
import type { ClientRequest } from 'node:http';
import { errorMonitor } from 'node:events';
import { NODE_VERSION } from '../../nodeVersion';

const INTEGRATION_NAME = 'Http';

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL =
  (NODE_VERSION.major === 22 && NODE_VERSION.minor >= 12) ||
  (NODE_VERSION.major === 23 && NODE_VERSION.minor >= 2) ||
  NODE_VERSION.major >= 24;

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
    // no spans created in light mode
    spans: false,
    errorMonitor,
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequestStart } = getHttpServerSubscriptions(_options);

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

      subscribe(HTTP_ON_SERVER_REQUEST, onHttpServerRequestStart);

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
