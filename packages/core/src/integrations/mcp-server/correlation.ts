/**
 * Request-span correlation system for MCP server instrumentation
 *
 * Handles mapping requestId to span data for correlation with handler execution.
 *
 * Correlation is scoped to the transport captured by the instrumentation wrapper. A session id
 * is peer-controlled and is not a unique transport identity.
 */

import { getClient } from '../../currentScopes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types/span';
import { ERROR_TYPE_ATTRIBUTE, MCP_REQUEST_OUTCOME_ATTRIBUTE } from './attributes';
import type { MCPTransport, RequestId, RequestSpanMapValue, SessionData } from './types';

type TransportSpanStore = WeakMap<MCPTransport, Map<RequestId, RequestSpanMapValue>>;

const incomingRequestSpans: TransportSpanStore = new WeakMap();
const outgoingRequestSpans: TransportSpanStore = new WeakMap();
const responseSendSpans: TransportSpanStore = new WeakMap();
const responseProcessingSpans: TransportSpanStore = new WeakMap();

/** Gets the span map for a transport identity. */
function getSpanMap(
  store: TransportSpanStore,
  transport: MCPTransport,
): Map<RequestId, RequestSpanMapValue> | undefined {
  return store.get(transport);
}

function getOrCreateSpanMap(store: TransportSpanStore, transport: MCPTransport): Map<RequestId, RequestSpanMapValue> {
  let spanMap = store.get(transport);
  if (!spanMap) {
    spanMap = new Map();
    store.set(transport, spanMap);
  }
  return spanMap;
}

function takeSpan(
  store: TransportSpanStore,
  transport: MCPTransport,
  requestId: RequestId,
): RequestSpanMapValue | undefined {
  const spanMap = getSpanMap(store, transport);
  const spanData = spanMap?.get(requestId);
  if (!spanMap || !spanData) {
    return undefined;
  }

  spanMap.delete(requestId);
  return spanData;
}

export function deleteSpanForResponseSend(transport: MCPTransport, spanData: RequestSpanMapValue): void {
  const spanMap = getSpanMap(responseSendSpans, transport);
  if (spanMap?.get(spanData.requestId) === spanData) {
    spanMap.delete(spanData.requestId);
  }
}

export function deleteSpanForOutgoingRequest(transport: MCPTransport, spanData: RequestSpanMapValue): void {
  const stores = [outgoingRequestSpans, responseProcessingSpans];
  for (const store of stores) {
    const spanMap = getSpanMap(store, transport);
    if (spanMap?.get(spanData.requestId) === spanData) {
      spanMap.delete(spanData.requestId);
    }
  }
}

export function finishSpan(spanData: RequestSpanMapValue, callback: (span: Span) => void): boolean {
  if (spanData.finished) {
    return false;
  }

  spanData.finished = true;
  callback(spanData.span);
  return true;
}

function shouldIncludeUserInfo(): boolean {
  return Boolean(getClient()?.getDataCollectionOptions().userInfo);
}

function finishDuplicateSpan(spanData: RequestSpanMapValue): void {
  finishSpan(spanData, span => {
    span.setAttributes({
      [ERROR_TYPE_ATTRIBUTE]: 'duplicate_request_id',
      [MCP_REQUEST_OUTCOME_ATTRIBUTE]: 'request_id_reused',
    });
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'duplicate_request_id' });
    span.end();
  });
}

/**
 * Stores span context for later correlation with handler execution
 * @param transport - MCP transport instance
 * @param requestId - Request identifier
 * @param span - Active span to correlate
 * @param method - MCP method name
 */
export function storeSpanForRequest(
  transport: MCPTransport,
  requestId: RequestId,
  span: Span,
  method: string,
  sessionData?: SessionData,
  traceContext?: { baggage?: string; tracestate?: string },
): void {
  const spanMap = getOrCreateSpanMap(incomingRequestSpans, transport);
  const previousSpan = spanMap.get(requestId) ?? takeSpan(responseSendSpans, transport, requestId);
  if (previousSpan) {
    finishDuplicateSpan(previousSpan);
  }
  spanMap.set(requestId, {
    requestId,
    span,
    method,
    protocolVersion: sessionData?.protocolVersion,
    sessionData,
    baggage: traceContext?.baggage,
    tracestate: traceContext?.tracestate,
    // oxlint-disable-next-line sdk/no-unsafe-random-apis
    startTime: Date.now(),
    includeUserInfo: shouldIncludeUserInfo(),
  });
}

/** Returns request correlation without consuming it. */
export function getSpanForRequest(transport: MCPTransport, requestId: RequestId): RequestSpanMapValue | undefined {
  return getSpanMap(incomingRequestSpans, transport)?.get(requestId);
}

/** Removes and returns an incoming request correlation. */
export function takeSpanForRequest(transport: MCPTransport, requestId: RequestId): RequestSpanMapValue | undefined {
  return takeSpan(incomingRequestSpans, transport, requestId);
}

/** Moves an incoming request to the in-flight response-send store. */
export function takeSpanForResponseSend(
  transport: MCPTransport,
  requestId: RequestId,
): RequestSpanMapValue | undefined {
  const spanData = takeSpan(incomingRequestSpans, transport, requestId);
  if (spanData) {
    getOrCreateSpanMap(responseSendSpans, transport).set(requestId, spanData);
  }
  return spanData;
}

/** Stores a client span for a server-to-client request. */
export function storeSpanForOutgoingRequest(
  transport: MCPTransport,
  requestId: RequestId,
  span: Span,
  method: string,
  sessionData?: SessionData,
  traceContext?: { baggage?: string; tracestate?: string },
): RequestSpanMapValue {
  const spanMap = getOrCreateSpanMap(outgoingRequestSpans, transport);
  const previousSpan = spanMap.get(requestId) ?? takeSpan(responseProcessingSpans, transport, requestId);
  if (previousSpan) {
    finishDuplicateSpan(previousSpan);
  }
  const spanData: RequestSpanMapValue = {
    requestId,
    span,
    method,
    protocolVersion: sessionData?.protocolVersion,
    sessionData,
    baggage: traceContext?.baggage,
    tracestate: traceContext?.tracestate,
    // oxlint-disable-next-line sdk/no-unsafe-random-apis
    startTime: Date.now(),
    includeUserInfo: shouldIncludeUserInfo(),
  };
  spanMap.set(requestId, spanData);
  return spanData;
}

/** Returns outgoing request correlation without consuming it. */
export function getSpanForOutgoingRequest(
  transport: MCPTransport,
  requestId: RequestId,
): RequestSpanMapValue | undefined {
  const spanMap = getSpanMap(outgoingRequestSpans, transport);
  return (
    spanMap?.get(requestId) ?? (typeof requestId === 'string' ? spanMap?.get(toNumericRequestId(requestId)) : undefined)
  );
}

function toNumericRequestId(requestId: string): number {
  const numericRequestId = Number(requestId);
  return Number.isFinite(numericRequestId) ? numericRequestId : Number.NaN;
}

export function takeSpanForCancelledRequest(
  transport: MCPTransport,
  requestId: RequestId,
): RequestSpanMapValue | undefined {
  return takeSpan(incomingRequestSpans, transport, requestId) ?? takeSpan(responseSendSpans, transport, requestId);
}

export function takeSpanForOutgoingRequest(
  transport: MCPTransport,
  requestId: RequestId,
): RequestSpanMapValue | undefined {
  const exactSpanData = takeSpan(outgoingRequestSpans, transport, requestId);
  return (
    exactSpanData ??
    (typeof requestId === 'string'
      ? takeSpan(outgoingRequestSpans, transport, toNumericRequestId(requestId))
      : undefined)
  );
}

export function takeSpanForOutgoingResponse(
  transport: MCPTransport,
  requestId: RequestId,
): RequestSpanMapValue | undefined {
  const spanData = takeSpanForOutgoingRequest(transport, requestId);
  if (spanData) {
    getOrCreateSpanMap(responseProcessingSpans, transport).set(spanData.requestId, spanData);
  }
  return spanData;
}

export function takePendingSpansForTransport(transport: MCPTransport): RequestSpanMapValue[] {
  const pendingSpans: RequestSpanMapValue[] = [];
  for (const store of [incomingRequestSpans, outgoingRequestSpans, responseSendSpans, responseProcessingSpans]) {
    const spanMap = store.get(transport);
    if (spanMap) {
      pendingSpans.push(...spanMap.values());
      spanMap.clear();
    }
  }
  return pendingSpans;
}
