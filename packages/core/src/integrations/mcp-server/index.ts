import { fill } from '../../utils/object';
import { logger } from '../../utils/logger';
import { DEBUG_BUILD } from '../../debug-build';
import type { ExtraHandlerData, MCPServerInstance, MCPTransport, McpHandlerExtra } from './types';
import {
  createMcpNotificationSpan,
  createMcpOutgoingNotificationSpan,
  createMcpServerSpan,
  isJsonRpcNotification,
  isJsonRpcRequest,
  validateMcpServerInstance,
} from './utils';

const wrappedMcpServerInstances = new WeakSet();
const wrappedHandlerMethods = new WeakSet();

// Map to track handler completion promises by request ID
const requestToHandlerPromiseMap = new Map<string | number, {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}>();

/**
 * Type for MCP handler callbacks
 */
type McpHandlerCallback = (...args: unknown[]) => unknown | Promise<unknown>;

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

  // Wrap tool, resource, and prompt methods to ensure proper async context
  wrapHandlerMethods(serverInstance);

  fill(serverInstance, 'connect', (originalConnect) => {
    return async function(this: MCPServerInstance, transport: MCPTransport, ...restArgs: unknown[]) {
      const result = await originalConnect.call(this, transport, ...restArgs);

      if (transport.onmessage) {
        fill(transport, 'onmessage', (originalOnMessage) => {
          return async function(this: MCPTransport, jsonRpcMessage: unknown, extra?: unknown) {
            if (isJsonRpcRequest(jsonRpcMessage)) {
              return await createMcpServerSpan(jsonRpcMessage, this, extra as ExtraHandlerData, async () => {
                const request = jsonRpcMessage as { id: string | number; method: string };
                
                const handlerPromise = new Promise<unknown>((resolve, reject) => {
                  requestToHandlerPromiseMap.set(request.id, { resolve, reject });
                  
                  setTimeout(() => {
                    const entry = requestToHandlerPromiseMap.get(request.id);
                    if (entry) {
                      requestToHandlerPromiseMap.delete(request.id);
                      resolve(undefined);
                    }
                  }, 30000);
                });

                const originalResult = originalOnMessage.call(this, jsonRpcMessage, extra);
                await handlerPromise;
                return originalResult;
              });
            }
            
            if (isJsonRpcNotification(jsonRpcMessage)) {
              return await createMcpNotificationSpan(jsonRpcMessage, this, extra as ExtraHandlerData, async () => {
                return await originalOnMessage.call(this, jsonRpcMessage, extra);
              });
            }
            return await originalOnMessage.call(this, jsonRpcMessage, extra);
          };
        });
      }

      if (transport.send) {
        fill(transport, 'send', (originalSend) => {
          return async function(this: MCPTransport, message: unknown) {
            if (isJsonRpcNotification(message)) {
              return await createMcpOutgoingNotificationSpan(message, this, async () => {
                return await originalSend.call(this, message);
              });
            }
            return await originalSend.call(this, message);
          };
        });
      }

      if (transport.onclose) {
        fill(transport, 'onclose', (originalOnClose) => {
          return function(this: MCPTransport, ...args: unknown[]) {
            for (const [, promiseEntry] of requestToHandlerPromiseMap.entries()) {
              promiseEntry.resolve(undefined);
            }
            requestToHandlerPromiseMap.clear();
            
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

/**
 * Wraps the tool, resource, and prompt registration methods to ensure
 * handlers execute within the correct span context
 */
function wrapHandlerMethods(serverInstance: MCPServerInstance): void {
  if (wrappedHandlerMethods.has(serverInstance)) {
    return;
  }

  fill(serverInstance, 'tool', (originalTool) => {
    return function(this: MCPServerInstance, ...args: unknown[]) {
      const toolName = args[0] as string;
      const lastArg = args[args.length - 1];
      
      if (typeof lastArg !== 'function') {
        return originalTool.apply(this, args);
      }

      const wrappedCallback = wrapHandlerCallback(lastArg as McpHandlerCallback, 'tool', toolName);
      const newArgs = [...args.slice(0, -1), wrappedCallback];
      
      return originalTool.apply(this, newArgs);
    };
  });

  fill(serverInstance, 'resource', (originalResource) => {
    return function(this: MCPServerInstance, ...args: unknown[]) {
      const resourceName = args[0] as string;
      const lastArg = args[args.length - 1];
      
      if (typeof lastArg !== 'function') {
        return originalResource.apply(this, args);
      }

      const wrappedCallback = wrapHandlerCallback(lastArg as McpHandlerCallback, 'resource', resourceName);
      const newArgs = [...args.slice(0, -1), wrappedCallback];
      
      return originalResource.apply(this, newArgs);
    };
  });

  fill(serverInstance, 'prompt', (originalPrompt) => {
    return function(this: MCPServerInstance, ...args: unknown[]) {
      const promptName = args[0] as string;
      const lastArg = args[args.length - 1];
      
      if (typeof lastArg !== 'function') {
        return originalPrompt.apply(this, args);
      }

      const wrappedCallback = wrapHandlerCallback(lastArg as McpHandlerCallback, 'prompt', promptName);
      const newArgs = [...args.slice(0, -1), wrappedCallback];
      
      return originalPrompt.apply(this, newArgs);
    };
  });

  wrappedHandlerMethods.add(serverInstance);
}

/**
 * Wraps a handler callback to ensure it executes within the correct span context
 */
function wrapHandlerCallback(callback: McpHandlerCallback, handlerType: string, handlerName: string): McpHandlerCallback {
  return async function(this: unknown, ...args: unknown[]) {
    const extra = args.find((arg): arg is McpHandlerExtra => 
      typeof arg === 'object' && 
      arg !== null && 
      'requestId' in arg
    );

    if (extra?.requestId) {
      const promiseEntry = requestToHandlerPromiseMap.get(extra.requestId);
      
      if (promiseEntry) {
        try {
          const result = await callback.apply(this, args);
          requestToHandlerPromiseMap.delete(extra.requestId);
          promiseEntry.resolve(result);
          return result;
        } catch (error) {
          requestToHandlerPromiseMap.delete(extra.requestId);
          promiseEntry.reject(error);
          throw error;
        }
      }
    }

    return await callback.apply(this, args);
  };
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
