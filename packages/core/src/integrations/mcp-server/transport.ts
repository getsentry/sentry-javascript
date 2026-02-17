/**
 * Transport layer instrumentation for MCP server
 *
 * Handles message interception and response correlation.
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */

import { getIsolationScope, withIsolationScope } from '../../currentScopes';
import { startInactiveSpan, withActiveSpan } from '../../tracing';
import { fill } from '../../utils/object';
import { MCP_PROTOCOL_VERSION_ATTRIBUTE } from './attributes';
import { cleanupPendingSpansForTransport, completeSpanWithResults, storeSpanForRequest } from './correlation';
import { captureError } from './errorCapture';
import {
  buildClientAttributesFromInfo,
  extractSessionDataFromInitializeRequest,
  extractSessionDataFromInitializeResponse,
} from './sessionExtraction';
import {
  cleanupSessionDataForTransport,
  storeSessionDataForTransport,
  updateSessionDataForTransport,
} from './sessionManagement';
import { buildMcpServerSpanConfig, createMcpNotificationSpan, createMcpOutgoingNotificationSpan } from './spans';
import type { ExtraHandlerData, MCPTransport, ResolvedMcpOptions, SessionData } from './types';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, isValidContentItem } from './validation';

/**
 * Wraps transport.onmessage to create spans for incoming messages.
 * For "initialize" requests, extracts and stores client info and protocol version
 * in the session data for the transport.
 * @param transport - MCP transport instance to wrap
 * @param options - Resolved MCP options
 */
export function wrapTransportOnMessage(transport: MCPTransport, options: ResolvedMcpOptions): void {
  if (transport.onmessage) {
    fill(transport, 'onmessage', originalOnMessage => {
      return function (this: MCPTransport, message: unknown, extra?: unknown) {
        if (isJsonRpcRequest(message)) {
          const isInitialize = message.method === 'initialize';
          let initSessionData: SessionData | undefined;

          if (isInitialize) {
            try {
              initSessionData = extractSessionDataFromInitializeRequest(message);
              storeSessionDataForTransport(this, initSessionData);
            } catch {
              // noop
            }
          }

          const isolationScope = getIsolationScope().clone();

          return withIsolationScope(isolationScope, () => {
            const spanConfig = buildMcpServerSpanConfig(message, this, extra as ExtraHandlerData, options);
            const span = startInactiveSpan(spanConfig);

            // For initialize requests, add client info directly to span (works even for stateless transports)
            if (isInitialize && initSessionData) {
              span.setAttributes({
                ...buildClientAttributesFromInfo(initSessionData.clientInfo),
                ...(initSessionData.protocolVersion && {
                  [MCP_PROTOCOL_VERSION_ATTRIBUTE]: initSessionData.protocolVersion,
                }),
              });
            }

            storeSpanForRequest(this, message.id, span, message.method);

            return withActiveSpan(span, () => {
              return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
            });
          });
        }

        if (isJsonRpcNotification(message)) {
          return createMcpNotificationSpan(message, this, extra as ExtraHandlerData, options, () => {
            return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
          });
        }

        return (originalOnMessage as (...args: unknown[]) => unknown).call(this, message, extra);
      };
    });
  }
}

/**
 * Wraps transport.send to handle outgoing messages and response correlation.
 * For "initialize" responses, extracts and stores protocol version and server info
 * in the session data for the transport.
 * @param transport - MCP transport instance to wrap
 * @param options - Resolved MCP options
 */
export function wrapTransportSend(transport: MCPTransport, options: ResolvedMcpOptions): void {
  if (transport.send) {
    fill(transport, 'send', originalSend => {
      return async function (this: MCPTransport, ...args: unknown[]) {
        const [message] = args;

        if (isJsonRpcNotification(message)) {
          return createMcpOutgoingNotificationSpan(message, this, options, () => {
            return (originalSend as (...args: unknown[]) => unknown).call(this, ...args);
          });
        }

        if (isJsonRpcResponse(message)) {
          if (message.id !== null && message.id !== undefined) {
            if (message.error) {
              captureJsonRpcErrorResponse(message.error);
            }

            if (isValidContentItem(message.result)) {
              if (message.result.protocolVersion || message.result.serverInfo) {
                try {
                  const serverData = extractSessionDataFromInitializeResponse(message.result);
                  updateSessionDataForTransport(this, serverData);
                } catch {
                  // noop
                }
              }
            }

            completeSpanWithResults(this, message.id, message.result, options);
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
        cleanupPendingSpansForTransport(this);
        cleanupSessionDataForTransport(this);
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
    if (errorResponse && typeof errorResponse === 'object' && 'code' in errorResponse && 'message' in errorResponse) {
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
