/**
 * Define the channels and subscription methods to subscribe to in order to
 * instrument the `node:http` module. Note that this does *not* actually
 * register the subscriptions, it simply returns a data object with the
 * channel names and the subscription handlers. Attach these to diagnostic
 * channels on Node versions where they are supported (ie, >=22.12.0).
 *
 * If any other platforms that do support diagnostic channels eventually add
 * channel coverage for the `node:http` client, then these methods can be
 * used on those platforms as well.
 *
 * This implementation is used in the client-patch strategy, by simply
 * calling the handlers with the relevant data at the appropriate time.
 */

import type { SpanStatus } from '../../types-hoist/spanStatus';
import { addOutgoingRequestBreadcrumb } from './add-outgoing-request-breadcrumb';
import { getSpanStatusFromHttpCode, SPAN_STATUS_ERROR, SPAN_STATUS_UNSET, startInactiveSpan } from '../../tracing';
import { debug } from '../../utils/debug-logger';
import type { Span } from '../../types-hoist/span';
import { LRUMap } from '../../utils/lru';
import { getOutgoingRequestSpanData, setIncomingResponseSpanData } from './get-outgoing-span-data';
import { getRequestUrl } from './get-request-url';
import { injectTracePropagationHeaders } from './inject-trace-propagation-headers';
import type { HttpInstrumentationOptions, HttpClientRequest } from './types';
import { DEBUG_BUILD } from '../../debug-build';
import { LOG_PREFIX, HTTP_ON_CLIENT_REQUEST } from './constants';
import type { ClientSubscriptionName } from './constants';
import { getClient } from '../../currentScopes';
import { hasSpansEnabled } from '../../utils/hasSpansEnabled';

type ChannelListener = (message: unknown, name: string | symbol) => void;

export type HttpClientSubscriptions = Record<ClientSubscriptionName, ChannelListener>;

export function getHttpClientSubscriptions(options: HttpInstrumentationOptions): HttpClientSubscriptions {
  const propagationDecisionMap = new LRUMap<string, boolean>(100);
  const client = getClient();
  const clientOptions = client?.getOptions();

  const {
    errorMonitor = 'error',
    spans: createSpans = clientOptions ? hasSpansEnabled(clientOptions) : true,
    propagateTrace = false,
    breadcrumbs = true,
  } = options;

  const onHttpClientRequestCreated: ChannelListener = (data: unknown): void => {
    const { request } = data as { request: HttpClientRequest };

    // check if request is ignored anyway
    if (options.ignoreOutgoingRequests?.(getRequestUrl(request), request)) {
      return;
    }

    if (propagateTrace) {
      injectTracePropagationHeaders(request, propagationDecisionMap);
    }

    if (!createSpans) {
      // Even without spans, set up a response listener for breadcrumbs.
      if (breadcrumbs) {
        request.prependListener('response', response => {
          if (request.listenerCount('response') <= 1) {
            response.resume();
          }
          response.on('end', () => addOutgoingRequestBreadcrumb(request, response));
          // TODO: should we include the response here, even though it errored?
          response.on(errorMonitor, () => addOutgoingRequestBreadcrumb(request, undefined));
        });
      }
      return;
    }

    const span = startInactiveSpan(getOutgoingRequestSpanData(request));
    options.outgoingRequestHook?.(span, request);

    let spanEnded = false;
    function endSpan(status: SpanStatus): void {
      if (!spanEnded) {
        spanEnded = true;
        span.setStatus(status);
        span.end();
      }
    }

    // Fallback: end span if the connection closes before any response.
    const requestOnClose = () => endSpan({ code: SPAN_STATUS_UNSET });
    request.on('close', requestOnClose);

    request.on(errorMonitor, error => {
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'outgoingRequest on request error()', error);
      endSpan({ code: SPAN_STATUS_ERROR });
    });

    request.prependListener('response', response => {
      // no longer need this, listen on response now
      request.removeListener('close', requestOnClose);
      if (request.listenerCount('response') <= 1) {
        response.resume();
      }
      setIncomingResponseSpanData(response, span);
      options.outgoingResponseHook?.(span, response);

      function finishWithResponse(error?: unknown): void {
        if (error) {
          DEBUG_BUILD && debug.log(LOG_PREFIX, 'outgoingRequest on response error()', error);
        }
        if (breadcrumbs) {
          addOutgoingRequestBreadcrumb(request, response);
        }
        const aborted = response.aborted && !response.complete;
        const status: SpanStatus =
          error || typeof response.statusCode !== 'number' || aborted
            ? { code: SPAN_STATUS_ERROR }
            : getSpanStatusFromHttpCode(response.statusCode);
        options.applyCustomAttributesOnSpan?.(span, request, response);
        endSpan(status);
      }

      response.on('end', finishWithResponse);
      response.on(errorMonitor, finishWithResponse);
    });
  };

  return {
    [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated,
  };
}
