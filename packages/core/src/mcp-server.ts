import type {
  ExtraHandlerData,
  MCPServerInstance,
  MCPTransport,
} from './utils/mcp-server/types';
import {
  createMcpNotificationSpan,
  createMcpOutgoingNotificationSpan,
  createMcpServerSpan,
  isJsonRpcNotification,
  isJsonRpcRequest,
  validateMcpServerInstance,
} from './utils/mcp-server/utils';
import { fill } from './utils/object';

const wrappedMcpServerInstances = new WeakSet();

/**
 * Wraps a MCP Server instance from the `@modelcontextprotocol/sdk` package with Sentry instrumentation.
 *
 * Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package.
 */
// We are exposing this API for non-node runtimes that cannot rely on auto-instrumentation.
export function wrapMcpServerWithSentry<S extends object>(mcpServerInstance: S): S {
  if (wrappedMcpServerInstances.has(mcpServerInstance)) {
    return mcpServerInstance;
  }

  if (!validateMcpServerInstance(mcpServerInstance)) {
    return mcpServerInstance;
  }

  const serverInstance = mcpServerInstance as MCPServerInstance;

  fill(serverInstance, 'connect', (originalConnect) => {
    return async function(this: MCPServerInstance, transport: MCPTransport, ...restArgs: unknown[]) {
      const result = await originalConnect.call(this, transport, ...restArgs);

      if (transport.onmessage) {
        fill(transport, 'onmessage', (originalOnMessage) => {
          return function(this: MCPTransport, jsonRpcMessage: unknown, extra?: unknown) {
            if (isJsonRpcRequest(jsonRpcMessage)) {
              return createMcpServerSpan(jsonRpcMessage, this, extra as ExtraHandlerData, () => {
                return originalOnMessage.call(this, jsonRpcMessage, extra);
              });
            }
            if (isJsonRpcNotification(jsonRpcMessage)) {
              return createMcpNotificationSpan(jsonRpcMessage, this, extra as ExtraHandlerData, () => {
                return originalOnMessage.call(this, jsonRpcMessage, extra);
              });
            }
            return originalOnMessage.call(this, jsonRpcMessage, extra);
          };
        });
      }

      if (transport.send) {
        fill(transport, 'send', (originalSend) => {
          return async function(this: MCPTransport, message: unknown) {
            if (isJsonRpcNotification(message)) {
              return createMcpOutgoingNotificationSpan(message, this, () => {
                return originalSend.call(this, message);
              });
            }
            return originalSend.call(this, message);
          };
        });
      }

      if (transport.onclose) {
        fill(transport, 'onclose', (originalOnClose) => {
          return function(this: MCPTransport, ...args: unknown[]) {
            return originalOnClose.call(this, ...args);
          };
        });
      }
      return result;
    };
  });

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance as S;
}

// =============================================================================
// SESSION AND REQUEST CORRELATION (Legacy support)
// =============================================================================

// const sessionAndRequestToRequestParentSpanMap = new Map<SessionId, Map<string, Span>>();

// function handleTransportOnClose(sessionId: SessionId): void {
//   sessionAndRequestToRequestParentSpanMap.delete(sessionId);
// }

// TODO(bete): refactor this and associateContextWithRequestSpan to use the new span API.
// function handleTransportOnMessage(sessionId: SessionId, requestId: string): void {
//   const activeSpan = getActiveSpan();
//   if (activeSpan) {
//     const requestIdToSpanMap = sessionAndRequestToRequestParentSpanMap.get(sessionId) ?? new Map();
//     requestIdToSpanMap.set(requestId, activeSpan);
//     sessionAndRequestToRequestParentSpanMap.set(sessionId, requestIdToSpanMap);
//   }
// }

// function associateContextWithRequestSpan<T>(
//   extraHandlerData: { sessionId: SessionId; requestId: string } | undefined,
//   cb: () => T,
// ): T {
//   if (extraHandlerData) {
//     const { sessionId, requestId } = extraHandlerData;
//     const requestIdSpanMap = sessionAndRequestToRequestParentSpanMap.get(sessionId);

//     if (!requestIdSpanMap) {
//       return cb();
//     }

//     const span = requestIdSpanMap.get(requestId);
//     if (!span) {
//       return cb();
//     }

//     // remove the span from the map so it can be garbage collected
//     requestIdSpanMap.delete(requestId);
//     return withActiveSpan(span, () => {
//       return cb();
//     });
//   }

//   return cb();
// }
