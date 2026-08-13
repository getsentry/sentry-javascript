/**
 * Transport layer instrumentation for MCP server
 *
 * Handles message interception and response correlation.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

import { getIsolationScope, withIsolationScope } from '../../currentScopes';
import { continueTrace, startInactiveSpan, startNewTrace, withActiveSpan } from '../../tracing';
import type { SpanLink } from '../../types/link';
import { chainAndCopyPromiseLike } from '../../utils/chain-and-copy-promiselike';
import { isThenable } from '../../utils/is';
import { fill } from '../../utils/object';
import { getActiveSpan } from '../../utils/spanUtils';
import { storeSpanForRequest, takeSpanForOutgoingResponse } from './correlation';
import { captureError } from './errorCapture';
import { extractSessionDataFromInitializeRequest, extractSessionDataFromMessage } from './sessionExtraction';
import {
  cleanupSessionDataForTransport,
  getSessionDataForTransport,
  updateSessionDataForTransport,
} from './sessionManagement';
import {
  cancelSpanForRequest,
  cleanupPendingSpansForTransport,
  completeTakenSpanForOutgoingResponse,
  failTakenSpanForOutgoingRequest,
} from './spanCompletion';
import { buildMcpServerSpanConfig, createMcpNotificationSpan } from './spans';
import { extractMcpTraceContext } from './tracePropagation';
import type { ExtraHandlerData, MCPTransport, ResolvedMcpOptions, SessionData } from './types';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from './validation';

export { wrapTransportSend } from './transportSend';

/**
 * Wraps transport.onmessage to create spans for incoming messages.
 * Extracts and stores client info and protocol version from legacy initialize
 * requests and modern message envelopes.
 * @param transport - MCP transport instance to wrap
 * @param options - Resolved MCP options
 */
export function wrapTransportOnMessage(transport: MCPTransport, options: ResolvedMcpOptions): void {
  if (transport.onmessage) {
    fill(transport, 'onmessage', originalOnMessage => {
      return function (this: MCPTransport, message: unknown, extra?: unknown) {
        const response = isJsonRpcResponse(message) ? message : undefined;
        if (response?.id != null) {
          const responseId = response.id;
          const spanData = takeSpanForOutgoingResponse(transport, responseId);
          if (spanData) {
            return withActiveSpan(spanData.span, () => {
              let result: unknown;
              try {
                result = (originalOnMessage as (...args: unknown[]) => unknown).call(this, response, extra);
              } catch (error) {
                failTakenSpanForOutgoingRequest(transport, spanData, error, 'response_error');
                throw error;
              }

              if (isThenable(result)) {
                return chainAndCopyPromiseLike(
                  result as PromiseLike<unknown> & Record<string, unknown>,
                  () => completeTakenSpanForOutgoingResponse(transport, spanData, response.result, response.error),
                  error => failTakenSpanForOutgoingRequest(transport, spanData, error, 'response_error'),
                );
              }

              completeTakenSpanForOutgoingResponse(transport, spanData, response.result, response.error);
              return result;
            });
          }
        }

        const request = isJsonRpcRequest(message) ? message : undefined;
        const notification = isJsonRpcNotification(message) ? message : undefined;
        const jsonRpcMessage = request || notification;
        let messageSessionData: SessionData | undefined;

        if (jsonRpcMessage) {
          try {
            messageSessionData = request
              ? request.method === 'initialize'
                ? extractSessionDataFromInitializeRequest(request)
                : applyModernTransportRevision(extractSessionDataFromMessage(request), extra as ExtraHandlerData)
              : extractNotificationSessionData(extra as ExtraHandlerData);
            if (request?.method === 'initialize') {
              updateSessionDataForTransport(transport, messageSessionData);
            }
          } catch {
            // noop
          }
        }

        if (jsonRpcMessage) {
          const ambientSpan = getActiveSpan();
          const traceContext = extractMcpTraceContext(jsonRpcMessage.params);
          const links =
            ambientSpan && traceContext
              ? getAmbientSpanLinks(ambientSpan.spanContext(), traceContext?.parentContext)
              : undefined;
          const parentSpan = traceContext ? undefined : ambientSpan;
          const isolationScope = getIsolationScope().clone();

          return withIsolationScope(isolationScope, () => {
            const runWithMessageTrace = (): unknown => {
              const operationSessionData =
                request?.method === 'initialize' || messageSessionData?.protocolVersion
                  ? messageSessionData
                  : undefined;

              if (request) {
                const spanConfig = buildMcpServerSpanConfig(
                  request,
                  transport,
                  extra as ExtraHandlerData,
                  options,
                  operationSessionData,
                  links,
                  parentSpan,
                );
                const span = startInactiveSpan(spanConfig);

                storeSpanForRequest(
                  transport,
                  request.id,
                  span,
                  request.method,
                  operationSessionData ?? getSessionDataForTransport(transport),
                  traceContext,
                );

                return withActiveSpan(span, () => {
                  return (originalOnMessage as (...args: unknown[]) => unknown).call(this, request, extra);
                });
              }

              if (notification!.method === 'notifications/cancelled') {
                const cancelledRequestId = notification!.params?.requestId;
                if (typeof cancelledRequestId === 'string' || typeof cancelledRequestId === 'number') {
                  cancelSpanForRequest(transport, cancelledRequestId);
                }
              }

              return createMcpNotificationSpan(
                notification!,
                transport,
                extra as ExtraHandlerData,
                options,
                () => {
                  return (originalOnMessage as (...args: unknown[]) => unknown).call(this, notification, extra);
                },
                operationSessionData,
                links,
                parentSpan,
              );
            };

            if (traceContext) {
              return continueTrace(
                { sentryTrace: traceContext.sentryTrace, baggage: traceContext.baggage },
                runWithMessageTrace,
              );
            }

            return ambientSpan ? runWithMessageTrace() : startNewTrace(runWithMessageTrace);
          });
        }

        return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
      };
    });
  }
}

function extractNotificationSessionData(extra: ExtraHandlerData): SessionData {
  return applyModernTransportRevision({}, extra);
}

function applyModernTransportRevision(sessionData: SessionData, extra: ExtraHandlerData): SessionData {
  const classification = extra?.classification;
  return classification?.era === 'modern' && typeof classification.revision === 'string'
    ? { ...sessionData, protocolVersion: classification.revision }
    : sessionData;
}

function getAmbientSpanLinks(
  ambientContext: ReturnType<NonNullable<ReturnType<typeof getActiveSpan>>['spanContext']>,
  remoteContext?: ReturnType<NonNullable<ReturnType<typeof getActiveSpan>>['spanContext']>,
): SpanLink[] | undefined {
  if (
    remoteContext &&
    ambientContext.traceId === remoteContext.traceId &&
    ambientContext.spanId === remoteContext.spanId
  ) {
    return undefined;
  }

  return [{ context: ambientContext }];
}

/**
 * Wraps transport.onclose to clean up pending spans for this transport only
 * @param transport - MCP transport instance to wrap
 */
export function wrapTransportOnClose(transport: MCPTransport): void {
  if (transport.onclose) {
    fill(transport, 'onclose', originalOnClose => {
      return function (this: MCPTransport, ...args: unknown[]) {
        try {
          return (originalOnClose as (...args: unknown[]) => unknown).call(this, ...args);
        } finally {
          setTimeout(() => {
            cleanupPendingSpansForTransport(transport);
            cleanupSessionDataForTransport(transport);
          });
        }
      };
    });
  }
}

/**
 * Wraps transport error handlers to capture connection errors
 * @param transport - MCP transport instance to wrap
 */
export function wrapTransportError(transport: MCPTransport): void {
  if (transport.onerror) {
    fill(transport, 'onerror', (originalOnError: (error: Error) => void) => {
      return function (this: MCPTransport, error: Error) {
        captureTransportError(error);
        return originalOnError.call(this, error);
      };
    });
  }
}

/**
 * Captures transport connection errors
 * @internal
 * @param error - Transport error
 */
function captureTransportError(error: Error): void {
  try {
    captureError(error, 'transport');
  } catch {
    // noop
  }
}
