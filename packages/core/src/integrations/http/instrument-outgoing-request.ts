import type { SpanStatus } from '../../types-hoist/spanStatus';
import type { LRUMap } from '../../utils/lru';
import { getSpanStatusFromHttpCode, SPAN_STATUS_ERROR, SPAN_STATUS_UNSET } from '../../tracing/spanstatus';
import { startInactiveSpan } from '../../tracing/trace';
import { getOutgoingRequestSpanData, setIncomingResponseSpanData } from './get-outgoing-span-data';
import { getRequestUrl } from './get-request-url';
import { injectTracePropagationHeaders } from './inject-trace-propagation-headers';
import type { HttpIncomingMessage, HttpClientRequest, HttpInstrumentationOptions } from './types';
import { addOutgoingRequestBreadcrumb } from './add-outgoing-request-breadcrumb';


/**
 * Attach Sentry span tracking and (optionally) trace-header injection to a
 * `ClientRequest` that has already been created.
 */
export function instrumentOutgoingRequest(
  request: HttpClientRequest,
  options: HttpInstrumentationOptions,
  propagationDecisionMap: LRUMap<string, boolean>,
): void {
  const createSpans = options.spans ?? true;
  const propagateTrace = options.propagateTrace ?? false;
  const errorEvent = options.errorMonitor ?? 'error';
  const breadcrumbs = options.breadcrumbs ?? true;

  if (options.ignoreOutgoingRequests?.(getRequestUrl(request), request)) {
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

  let responseFinished = false;

  function endSpan(status: SpanStatus): void {
    if (!responseFinished) {
      responseFinished = true;
      span.setStatus(status);
      span.end();
    }
  }

  // Listen for the response
  request.prependListener('response', (response: unknown) => {
    const res = response as HttpIncomingMessage;

    // If no-one else is listening, resume so the socket doesn't back-pressure
    if (request.listenerCount('response') <= 1) {
      res.resume();
    }

    setIncomingResponseSpanData(res, span);

    options.outgoingResponseHook?.(span, res);

    function endHandler(forceError: boolean = false): void {
      if (breadcrumbs) {
        addOutgoingRequestBreadcrumb(request, res);
      }
      const status: SpanStatus =
        forceError || typeof res.statusCode !== 'number' || (res.aborted && !res.complete)
          ? { code: SPAN_STATUS_ERROR }
          : getSpanStatusFromHttpCode(res.statusCode);

      options.applyCustomAttributesOnSpan?.(span, request, res);
      endSpan(status);
    }

    res.on('end', () => endHandler());
    res.on(errorEvent as string, () => endHandler(true));
  });

  // Fallback: request closed without a response
  request.on('close', () => endSpan({ code: SPAN_STATUS_UNSET }));

  // Request-level error
  request.on(errorEvent as string, () => endSpan({ code: SPAN_STATUS_ERROR }));
}
