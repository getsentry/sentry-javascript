/**
 * Transport layer instrumentation for MCP server
 * Handles message interception and response correlation
 */

import { getIsolationScope, withIsolationScope } from '../../currentScopes';
import { startInactiveSpan, withActiveSpan } from '../../tracing';
import { fill } from '../../utils/object';
import { cleanupAllPendingSpans, completeSpanWithResults, storeSpanForRequest } from './correlation';
import { captureError } from './errorCapture';
import { buildMcpServerSpanConfig, createMcpNotificationSpan, createMcpOutgoingNotificationSpan } from './spans';
import type { ExtraHandlerData, MCPTransport } from './types';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse } from './validation';

/**
 * Wraps transport.onmessage to create spans for incoming messages
 */
export function wrapTransportOnMessage(transport: MCPTransport): void {
  if (transport.onmessage) {
    fill(transport, 'onmessage', originalOnMessage => {
      return function (this: MCPTransport, jsonRpcMessage: unknown, extra?: unknown) {
        if (isJsonRpcRequest(jsonRpcMessage)) {
          const messageTyped = jsonRpcMessage as { method: string; id: string | number };

          // Create isolation scope for this request (standard Sentry pattern)
          const isolationScope = getIsolationScope().clone();

          return withIsolationScope(isolationScope, () => {
            // Create manual span that stays open until response
            const spanConfig = buildMcpServerSpanConfig(jsonRpcMessage, this, extra as ExtraHandlerData);
            const span = startInactiveSpan(spanConfig);

            // Store span context for handler correlation using requestId
            storeSpanForRequest(messageTyped.id, span, messageTyped.method);

            // Execute handler within span context
            return withActiveSpan(span, () => {
              return (originalOnMessage as (...args: unknown[]) => unknown).call(this, jsonRpcMessage, extra);
            });
          });
        }

        if (isJsonRpcNotification(jsonRpcMessage)) {
          return createMcpNotificationSpan(jsonRpcMessage, this, extra as ExtraHandlerData, () => {
            return (originalOnMessage as (...args: unknown[]) => unknown).call(this, jsonRpcMessage, extra);
          });
        }

        return (originalOnMessage as (...args: unknown[]) => unknown).call(this, jsonRpcMessage, extra);
      };
    });
  }
}

/**
 * Wraps transport.send to handle outgoing messages and response correlation
 */
export function wrapTransportSend(transport: MCPTransport): void {
  if (transport.send) {
    fill(transport, 'send', originalSend => {
      return async function (this: MCPTransport, message: unknown) {
        // Handle outgoing notifications
        if (isJsonRpcNotification(message)) {
          return createMcpOutgoingNotificationSpan(message, this, () => {
            return (originalSend as (...args: unknown[]) => unknown).call(this, message);
          });
        }

        if (isJsonRpcResponse(message)) {
          const messageTyped = message as { id: string | number; result?: unknown; error?: unknown };

          if (messageTyped.id !== null && messageTyped.id !== undefined) {
            if (messageTyped.error) {
              captureJsonRpcErrorResponse(messageTyped.error, messageTyped.id, this);
            }

            completeSpanWithResults(messageTyped.id, messageTyped.result);
          }
        }

        return (originalSend as (...args: unknown[]) => unknown).call(this, message);
      };
    });
  }
}

/**
 * Wraps transport.onclose to clean up pending spans
 */
export function wrapTransportOnClose(transport: MCPTransport): void {
  if (transport.onclose) {
    fill(transport, 'onclose', originalOnClose => {
      return function (this: MCPTransport, ...args: unknown[]) {
        cleanupAllPendingSpans();

        return (originalOnClose as (...args: unknown[]) => unknown).call(this, ...args);
      };
    });
  }
}

/**
 * Wraps transport error handlers to capture connection errors
 */
export function wrapTransportError(transport: MCPTransport): void {
  // All MCP transports have an onerror method as part of the standard interface
  if (transport.onerror) {
    fill(transport, 'onerror', (originalOnError: (error: Error) => void) => {
      return function (this: MCPTransport, error: Error) {
        captureTransportError(error, this);
        return originalOnError.call(this, error);
      };
    });
  }
}

/**
 * Captures JSON-RPC error responses
 * Only captures server-side errors, not client validation errors
 */
function captureJsonRpcErrorResponse(
  errorResponse: unknown,
  _requestId: string | number,
  _transport: MCPTransport,
): void {
  try {
    if (errorResponse && typeof errorResponse === 'object' && 'code' in errorResponse && 'message' in errorResponse) {
      const jsonRpcError = errorResponse as { code: number; message: string; data?: unknown };

      // Only capture server-side errors, not client validation errors
      // Per JSON-RPC 2.0 error object spec:
      // https://www.jsonrpc.org/specification#error_object
      const isServerError = jsonRpcError.code === -32603 || (jsonRpcError.code >= -32099 && jsonRpcError.code <= -32000);

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
 */
function captureTransportError(error: Error, _transport: MCPTransport): void {
  try {
    captureError(error, 'transport');
  } catch {
    // noop
  }
}
