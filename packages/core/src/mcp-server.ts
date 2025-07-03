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

  // Wrap connect() to intercept AFTER Protocol sets up transport handlers
  const originalConnect = serverInstance.connect.bind(serverInstance);
  serverInstance.connect = new Proxy(originalConnect, {
    async apply(target, thisArg, argArray) {
      const [transport, ...restArgs] = argArray as [MCPTransport, ...unknown[]];

      // Call the original connect first to let Protocol set up its handlers
      const result = await Reflect.apply(target, thisArg, [transport, ...restArgs]);

      // Intercept incoming messages via onmessage
      if (transport.onmessage) {
        const protocolOnMessage = transport.onmessage.bind(transport);

        transport.onmessage = new Proxy(protocolOnMessage, {
          apply(onMessageTarget, onMessageThisArg, onMessageArgs) {
            const [jsonRpcMessage, extra] = onMessageArgs;

            // Instrument both requests and notifications
            if (isJsonRpcRequest(jsonRpcMessage)) {
              return createMcpServerSpan(jsonRpcMessage, transport, extra as ExtraHandlerData, () => {
                return Reflect.apply(onMessageTarget, onMessageThisArg, onMessageArgs);
              });
            }
            if (isJsonRpcNotification(jsonRpcMessage)) {
              return createMcpNotificationSpan(jsonRpcMessage, transport, extra as ExtraHandlerData, () => {
                return Reflect.apply(onMessageTarget, onMessageThisArg, onMessageArgs);
              });
            }

            return Reflect.apply(onMessageTarget, onMessageThisArg, onMessageArgs);
          },
        });
      }

      // Intercept outgoing messages via send
      if (transport.send) {
        const originalSend = transport.send.bind(transport);

        transport.send = new Proxy(originalSend, {
          async apply(sendTarget, sendThisArg, sendArgs) {
            const [message] = sendArgs;

            // Instrument outgoing notifications (but not requests/responses)
            if (isJsonRpcNotification(message)) {
              return createMcpOutgoingNotificationSpan(message, transport, () => {
                return Reflect.apply(sendTarget, sendThisArg, sendArgs);
              });
            }

            return Reflect.apply(sendTarget, sendThisArg, sendArgs);
          },
        });
      }

      // Handle transport lifecycle events
      if (transport.onclose) {
        const originalOnClose = transport.onclose.bind(transport);
        transport.onclose = new Proxy(originalOnClose, {
          apply(onCloseTarget, onCloseThisArg, onCloseArgs) {
            // TODO(bete): session and request correlation (methods at the bottom of this file)
            // if (transport.sessionId) {
            //   handleTransportOnClose(transport.sessionId);
            // }
            return Reflect.apply(onCloseTarget, onCloseThisArg, onCloseArgs);
          },
        });
      }
      return result;
    },
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
