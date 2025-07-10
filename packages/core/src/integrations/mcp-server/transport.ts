/**
 * Transport layer instrumentation for MCP server
 * Handles message interception and response correlation
 */

import { getIsolationScope, withIsolationScope } from '../../currentScopes';
import { startInactiveSpan, withActiveSpan } from '../../tracing';
import { fill } from '../../utils/object';
import { cleanupAllPendingSpans, completeSpanWithResults, storeSpanForRequest } from './correlation';
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

        // Handle responses - enrich spans with tool results
        if (isJsonRpcResponse(message)) {
          const messageTyped = message as { id: string | number; result?: unknown; error?: unknown };

          if (messageTyped.id !== null && messageTyped.id !== undefined) {
            // Complete span with tool results
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
        // Clean up any pending spans on transport close
        cleanupAllPendingSpans();

        return (originalOnClose as (...args: unknown[]) => unknown).call(this, ...args);
      };
    });
  }
}