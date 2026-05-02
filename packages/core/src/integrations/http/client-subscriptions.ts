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
import {
  getSpanStatusFromHttpCode,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_UNSET,
  startInactiveSpan,
  SUPPRESS_TRACING_KEY,
  withActiveSpan,
} from '../../tracing';
import { debug } from '../../utils/debug-logger';
import { LRUMap } from '../../utils/lru';
import { getOutgoingRequestSpanData, setIncomingResponseSpanData } from './get-outgoing-span-data';
import { getRequestUrlFromClientRequest } from './get-request-url';
import { injectTracePropagationHeaders } from './inject-trace-propagation-headers';
import type { HttpInstrumentationOptions, HttpClientRequest, HttpIncomingMessage } from './types';
import { DEBUG_BUILD } from '../../debug-build';
import { LOG_PREFIX, HTTP_ON_CLIENT_REQUEST } from './constants';
import type { ClientSubscriptionName } from './constants';
import { getClient, getCurrentScope } from '../../currentScopes';
import { hasSpansEnabled } from '../../utils/hasSpansEnabled';
import { doubleWrapWarning } from './double-wrap-warning';

type ChannelListener = (message: unknown, name: string | symbol) => void;

export type HttpClientSubscriptions = Record<ClientSubscriptionName, ChannelListener>;

export function getHttpClientSubscriptions(options: HttpInstrumentationOptions): HttpClientSubscriptions {
  const propagationDecisionMap = new LRUMap<string, boolean>(100);
  const getConfig = () => getClient()?.getOptions();

  const onHttpClientRequestCreated: ChannelListener = (data: unknown): void => {
    // Skip all instrumentation if tracing is suppressed
    // (e.g., Sentry's own transport uses this to avoid self-instrumentation)
    if (getCurrentScope().getScopeData().sdkProcessingMetadata[SUPPRESS_TRACING_KEY] === true) {
      return;
    }

    const clientOptions = getConfig();
    const {
      errorMonitor = 'error',
      spans: createSpans = clientOptions ? hasSpansEnabled(clientOptions) : true,
      propagateTrace = false,
      breadcrumbs = true,
      http,
      https,
      suppressOtelWarning = false,
    } = options;

    const { request } = data as { request: HttpClientRequest };

    // check if request is ignored. if so, we do nothing at all.
    if (options.ignoreOutgoingRequests?.(getRequestUrlFromClientRequest(request), request)) {
      return;
    }

    // guard against adding breadcrumbs multiple times, or when not enabled
    let addedBreadcrumbs = false;
    function addBreadcrumbs(request: HttpClientRequest, response: HttpIncomingMessage | undefined) {
      if (!addedBreadcrumbs) {
        addedBreadcrumbs = true;
        addOutgoingRequestBreadcrumb(request, response);
      }
    }

    // called if spans and/or trace propagation are disabled
    function breadcrumbsOnly(request: HttpClientRequest) {
      request.on(errorMonitor, () => addBreadcrumbs(request, undefined));
      request.prependListener('response', response => {
        if (request.listenerCount('response') <= 1) {
          response.resume();
        }
        response.on('end', () => addBreadcrumbs(request, response));
        response.on(errorMonitor, () => addBreadcrumbs(request, response));
      });
    }

    if (!createSpans) {
      // no spans, but maybe tracing and/or breadcrumbs
      if (breadcrumbs) {
        breadcrumbsOnly(request);
      }
      if (propagateTrace) {
        injectTracePropagationHeaders(request, propagationDecisionMap);
      }
      return;
    }

    // guard against OTel wrapping the same module and emitting double-spans
    // this doesn't prevent it, just prints a debug warning for the user.
    if (!suppressOtelWarning) {
      if (http) doubleWrapWarning(http);
      if (https) doubleWrapWarning(https);
    }

    // spans are enabled
    const span = startInactiveSpan(getOutgoingRequestSpanData(request));
    options.outgoingRequestHook?.(span, request);

    // Inject trace headers after span creation so sentry-trace contains the
    // outgoing span's ID (not the parent's), enabling downstream services to
    // link to this span.
    if (propagateTrace) {
      if (span.isRecording()) {
        withActiveSpan(span, () => {
          injectTracePropagationHeaders(request, propagationDecisionMap);
        });
      } else {
        injectTracePropagationHeaders(request, propagationDecisionMap);
      }
    }

    let spanEnded = false;
    function endSpan(status: SpanStatus): void {
      if (!spanEnded) {
        spanEnded = true;
        span.setStatus(status);
        span.end();
      }
    }

    // Fallback: end span if the connection closes before any response.
    // This is removed if we do get a response, because in that case
    // we want to only end the span when the response is finished.
    const requestOnClose = () => endSpan({ code: SPAN_STATUS_UNSET });
    request.on('close', requestOnClose);

    request.on(errorMonitor, error => {
      DEBUG_BUILD && debug.log(LOG_PREFIX, 'outgoingRequest on request error()', error);
      if (breadcrumbs) {
        addBreadcrumbs(request, undefined);
      }
      endSpan({ code: SPAN_STATUS_ERROR });
    });

    request.prependListener('response', response => {
      // no longer need this, listen on response now.
      // do not end the span until the response finishes
      request.removeListener('close', requestOnClose);
      if (request.listenerCount('response') <= 1) {
        response.resume();
      }
      setIncomingResponseSpanData(response, span);
      options.outgoingResponseHook?.(span, response);

      let finished = false;
      function finishWithResponse(error?: unknown): void {
        if (!finished) {
          finished = true;
          if (error) {
            DEBUG_BUILD && debug.log(LOG_PREFIX, 'outgoingRequest on response error()', error);
          }
          if (breadcrumbs) {
            addBreadcrumbs(request, response);
          }
          const aborted = response.aborted && !response.complete;
          const status: SpanStatus =
            error || typeof response.statusCode !== 'number' || aborted
              ? { code: SPAN_STATUS_ERROR }
              : getSpanStatusFromHttpCode(response.statusCode);
          options.applyCustomAttributesOnSpan?.(span, request, response);
          endSpan(status);
        }
      }

      response.on('end', () => finishWithResponse());
      response.on(errorMonitor, finishWithResponse);
    });
  };

  return {
    [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated,
  };
}
