import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe } from 'node:diagnostics_channel';
import type { Integration, IntegrationFn } from '@sentry/core';
import { LRUMap } from '@sentry/core';
import type { UndiciRequest, UndiciResponse } from '../../integrations/node-fetch/types';
import {
  addFetchRequestBreadcrumb,
  addTracePropagationHeadersToFetchRequest,
  getAbsoluteUrl,
} from '../../utils/outgoingFetchRequest';

const INTEGRATION_NAME = 'NodeFetch';

export interface NativeNodeFetchIntegrationOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture breadcrumbs or inject headers for outgoing fetch requests to URLs
   * where the given callback returns `true`.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const _nativeNodeFetchIntegration = ((options: NativeNodeFetchIntegrationOptions = {}) => {
  const _options = {
    breadcrumbs: options.breadcrumbs ?? true,
    ignoreOutgoingRequests: options.ignoreOutgoingRequests,
  };

  const propagationDecisionMap = new LRUMap<string, boolean>(100);
  const ignoreOutgoingRequestsMap = new WeakMap<UndiciRequest, boolean>();

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const onRequestCreated = ((_data: unknown) => {
        const data = _data as { request: UndiciRequest };
        onUndiciRequestCreated(data.request, _options, propagationDecisionMap, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      const onResponseHeaders = ((_data: unknown) => {
        const data = _data as { request: UndiciRequest; response: UndiciResponse };
        onUndiciResponseHeaders(data.request, data.response, _options, ignoreOutgoingRequestsMap);
      }) satisfies ChannelListener;

      subscribe('undici:request:create', onRequestCreated);
      subscribe('undici:request:headers', onResponseHeaders);
    },
  };
}) satisfies IntegrationFn;

/**
 * This integration handles outgoing fetch (undici) requests in light mode (without OpenTelemetry).
 * It propagates trace headers and creates breadcrumbs for responses.
 */
export const nativeNodeFetchIntegration = _nativeNodeFetchIntegration as (
  options?: NativeNodeFetchIntegrationOptions,
) => Integration & {
  name: 'NodeFetch';
  setupOnce: () => void;
};

function onUndiciRequestCreated(
  request: UndiciRequest,
  options: { ignoreOutgoingRequests?: (url: string) => boolean },
  propagationDecisionMap: LRUMap<string, boolean>,
  ignoreOutgoingRequestsMap: WeakMap<UndiciRequest, boolean>,
): void {
  const shouldIgnore = shouldIgnoreRequest(request, options);
  ignoreOutgoingRequestsMap.set(request, shouldIgnore);

  if (shouldIgnore) {
    return;
  }

  addTracePropagationHeadersToFetchRequest(request, propagationDecisionMap);
}

function onUndiciResponseHeaders(
  request: UndiciRequest,
  response: UndiciResponse,
  options: { breadcrumbs: boolean },
  ignoreOutgoingRequestsMap: WeakMap<UndiciRequest, boolean>,
): void {
  if (!options.breadcrumbs) {
    return;
  }

  const shouldIgnore = ignoreOutgoingRequestsMap.get(request);
  if (shouldIgnore) {
    return;
  }

  addFetchRequestBreadcrumb(request, response);
}

/** Check if the given outgoing request should be ignored. */
function shouldIgnoreRequest(
  request: UndiciRequest,
  options: { ignoreOutgoingRequests?: (url: string) => boolean },
): boolean {
  const { ignoreOutgoingRequests } = options;

  if (!ignoreOutgoingRequests) {
    return false;
  }

  const url = getAbsoluteUrl(request.origin, request.path);
  return ignoreOutgoingRequests(url);
}
