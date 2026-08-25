/**
 * Transport layer instrumentation for MCP server
 *
 * Handles message interception and response correlation.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

import { getIsolationScope, withIsolationScope } from '../../currentScopes';
import { withActiveSpan } from '../../tracing';
import { startInactiveSpan } from '../../tracing/trace';
import { isObjectLike } from '../../utils/is';
import { fill } from '../../utils/object';
import { MCP_PROTOCOL_VERSION_ATTRIBUTE } from './attributes';
import { cleanupPendingSpansForTransport, completeSpanWithResults, storeSpanForRequest } from './correlation';
import { captureError } from './errorCapture';
import {
  buildClientAttributesFromInfo,
  extractSessionDataFromInitializeRequest,
  extractSessionDataFromMessage,
} from './sessionExtraction';
import { cleanupSessionDataForTransport, updateSessionDataForTransport } from './sessionManagement';
import { buildMcpServerSpanConfig, createMcpNotificationSpan, createMcpOutgoingNotificationSpan } from './spans';
import type { ExtraHandlerData, MCPTransport, ResolvedMcpOptions, SessionData } from './types';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from './validation';

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
        const request = isJsonRpcRequest(message) ? message : undefined;
        const notification = isJsonRpcNotification(message) ? message : undefined;
        const jsonRpcMessage = request || notification;
        let messageSessionData: SessionData | undefined;

        if (jsonRpcMessage) {
          try {
            messageSessionData =
              request?.method === 'initialize'
                ? extractSessionDataFromInitializeRequest(request)
                : extractSessionDataFromMessage(jsonRpcMessage);
            if (messageSessionData.protocolVersion || messageSessionData.clientInfo) {
              updateSessionDataForTransport(transport, messageSessionData);
            }
          } catch {
            // noop
          }
        }

        if (request) {
          const isolationScope = getIsolationScope().clone();

          return withIsolationScope(isolationScope, () => {
            const spanConfig = buildMcpServerSpanConfig(request, transport, extra as ExtraHandlerData, options);
            const span = startInactiveSpan(spanConfig);

            if (request.method === 'initialize' && messageSessionData) {
              span.setAttributes({
                ...buildClientAttributesFromInfo(messageSessionData.clientInfo),
                ...(messageSessionData.protocolVersion && {
                  [MCP_PROTOCOL_VERSION_ATTRIBUTE]: messageSessionData.protocolVersion,
                }),
              });
            }

            storeSpanForRequest(transport, request.id, span, request.method);

            return withActiveSpan(span, () => {
              return (originalOnMessage as (...args: unknown[]) => unknown).call(this, request, extra);
            });
          });
        }

        if (notification) {
          return createMcpNotificationSpan(notification, transport, extra as ExtraHandlerData, options, () => {
            return (originalOnMessage as (...args: unknown[]) => unknown).call(this, notification, extra);
          });
        }

        return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
      };
    });
  }
}

/**
 * Wraps transport.send to handle outgoing messages and response correlation.
 * Extracts and stores protocol version and server info from legacy initialize
 * responses and modern result metadata.
 * @param transport - MCP transport instance to wrap
 * @param options - Resolved MCP options
 */
export function wrapTransportSend(transport: MCPTransport, options: ResolvedMcpOptions): void {
  if (transport.send) {
    fill(transport, 'send', originalSend => {
      return async function (this: MCPTransport, ...args: unknown[]) {
        const [message] = args;

        if (isJsonRpcNotification(message)) {
          return createMcpOutgoingNotificationSpan(message, transport, options, () => {
            return (originalSend as (...args: unknown[]) => unknown).call(this, ...args);
          });
        }

        if (isJsonRpcResponse(message)) {
          if (message.id !== null && message.id !== undefined) {
            if (message.error) {
              captureJsonRpcErrorResponse(message.error);
            }

            completeSpanWithResults(transport, message.id, message.result, options, !!message.error);
          }
        }

        return (originalSend as (...args: unknown[]) => unknown).call(this, ...args);
      };
    });
  }
}

/**
 * Wraps transport.onclose to clean up pending spans for this transport only
 * @param transport - MCP transport instance to wrap
 */
export function wrapTransportOnClose(transport: MCPTransport): void {
  if (transport.onclose) {
    fill(transport, 'onclose', originalOnClose => {
      return function (this: MCPTransport, ...args: unknown[]) {
        cleanupPendingSpansForTransport(transport);
        cleanupSessionDataForTransport(transport);
        return (originalOnClose as (...args: unknown[]) => unknown).call(this, ...args);
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
 * Captures JSON-RPC error responses for server-side errors.
 * @see https://www.jsonrpc.org/specification#error_object
 * @internal
 * @param errorResponse - JSON-RPC error response
 */
function captureJsonRpcErrorResponse(errorResponse: unknown): void {
  try {
    if (isObjectLike(errorResponse) && 'code' in errorResponse && 'message' in errorResponse) {
      const jsonRpcError = errorResponse as { code: number; message: string; data?: unknown };

      const isServerError =
        jsonRpcError.code === -32603 || (jsonRpcError.code >= -32099 && jsonRpcError.code <= -32000);

      if (isServerError) {
        const error = new Error(jsonRpcError.message);
        error.name = `JsonRpcError_${jsonRpcError.code}`;

        captureError(error, 'protocol');
      }
    }
  } catch {
    // noop
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
