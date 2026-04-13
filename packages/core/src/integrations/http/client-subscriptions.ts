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
import type { HttpInstrumentationOptions, HttpClientRequest, HttpIncomingMessage } from './types';
import { DEBUG_BUILD } from '../../debug-build';
import { LOG_PREFIX, HTTP_ON_REQUEST_CREATED, HTTP_ON_REQUEST_ERROR, HTTP_ON_RESPONSE_FINISH } from './constants';
import type { ClientSubscriptionName } from './constants';
import { getClient } from '../../currentScopes';
import { hasSpansEnabled } from '../../utils/hasSpansEnabled';

type ChannelListener = (message: unknown, name: string | symbol) => void;

export type HttpClientSubscriptions = Record<ClientSubscriptionName, ChannelListener>;

export function getHttpClientSubscriptions(options: HttpInstrumentationOptions): HttpClientSubscriptions {
  const propagationDecisionMap = new LRUMap<string, boolean>(100);
  // if the request is ignored, set this value to `false`.
  // otherwise, set to the Span that we create for it.
  // If it's in the map, then we have not yet ended the span.
  const requestMap = new WeakMap<HttpClientRequest, false | Span>();

  const client = getClient();
  const clientOptions = client?.getOptions();

  const {
    errorMonitor = 'error',
    spans: createSpans = clientOptions ? hasSpansEnabled(clientOptions) : true,
    propagateTrace = false,
    breadcrumbs = true,
  } = options;

  // pass in the span if we have it to save a WeakMap lookup
  let spanEnded = false;
  function endSpan(
    request: HttpClientRequest,
    status: SpanStatus,
    span: Span | false | undefined = requestMap.get(request),
  ): void {
    if (span && !spanEnded) {
      spanEnded = true;
      span.setStatus(status);
      span.end();
      requestMap.delete(request);
    }
  }

  function endHandler(
    request: HttpClientRequest,
    res?: HttpIncomingMessage,
    forceError: boolean = !res,
    span: Span | undefined | false = requestMap.get(request),
  ): void {
    // ignored
    if (!span) {
      return;
    }

    if (breadcrumbs) {
      addOutgoingRequestBreadcrumb(request, res);
    }

    const status: SpanStatus =
      !res || forceError || typeof res.statusCode !== 'number' || (res.aborted && !res.complete)
        ? { code: SPAN_STATUS_ERROR }
        : getSpanStatusFromHttpCode(res.statusCode);

    if (res) {
      options.applyCustomAttributesOnSpan?.(span, request, res);
    }
    endSpan(request, status, span);
  }

  function ignoreRequest(request: HttpClientRequest): boolean {
    const mapResult = requestMap.get(request);
    // has been set, and set to false
    if (mapResult === false) {
      return true;
    }

    if (!options.ignoreOutgoingRequests) {
      return false;
    }

    const ignore = options.ignoreOutgoingRequests(getRequestUrl(request), request);

    if (ignore) {
      requestMap.set(request, false);
    }
    return ignore;
  }

  const onHttpClientRequestCreated: ChannelListener = (data: unknown): void => {
    const { request } = data as { request: HttpClientRequest };

    if (ignoreRequest(request)) {
      return;
    }

    if (propagateTrace) {
      injectTracePropagationHeaders(request, propagationDecisionMap);
    }

    if (!createSpans) {
      return;
    }

    const span = startInactiveSpan(getOutgoingRequestSpanData(request));
    options.outgoingRequestHook?.(span, request);

    // just in case the response hooks don't fire, eg if the response closes
    // prematurely or something, attach handlers here to be certain we don't
    // dangle spans.
    const requestOnClose = () => endSpan(request, { code: SPAN_STATUS_UNSET }, span);
    request.on('close', requestOnClose);

    // TODO: if we have to attach an errorMonitor here anyway, is it even
    // worthwhile to have the ON_REQUEST_ERROR subscriber?
    request.on(errorMonitor, error => {
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'outgoingRequest on requst error()', error);
      endSpan(request, { code: SPAN_STATUS_ERROR }, span);
    });

    request.prependListener('response', res => {
      // no longer need this, listen on response now
      request.removeListener('close', requestOnClose);
      const response = res as HttpIncomingMessage;
      if (request.listenerCount('response') <= 1) {
        response.resume();
      }
      setIncomingResponseSpanData(response, span);
      options.outgoingResponseHook?.(span, response);
      response.on('end', () => endHandler(request, response, false, span));
      response.on(errorMonitor, error => {
        DEBUG_BUILD && debug.log(LOG_PREFIX, 'outgoingRequest on response error()', error);
        endHandler(request, response, true, span);
      });
    });
  };

  // XXX: is this relevant? or just extra noise
  const onHttpClientRequestFinish: ChannelListener = (data: unknown): void => {
    const { request, response } = data as { request: HttpClientRequest; response: HttpIncomingMessage };
    endHandler(request, response);
  };

  // XXX: is this relevant, or just extra noise?
  const onHttpClientRequestError: ChannelListener = (data: unknown): void => {
    const { request } = data as { request: HttpClientRequest };
    endHandler(request);
  };

  return {
    [HTTP_ON_REQUEST_ERROR]: onHttpClientRequestError,
    [HTTP_ON_RESPONSE_FINISH]: onHttpClientRequestFinish,
    [HTTP_ON_REQUEST_CREATED]: onHttpClientRequestCreated,
  };
}
