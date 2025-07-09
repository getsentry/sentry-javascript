import { fill } from '../../utils/object';
import type { ExtraHandlerData, MCPServerInstance, MCPTransport } from './types';
import {
  createMcpHandlerSpan,
  createMcpNotificationSpan,
  createMcpOutgoingNotificationSpan,
} from './spans';
import { isJsonRpcRequest, isJsonRpcNotification } from './guards';

/**
 * Type for MCP handler callbacks
 */
type McpHandlerCallback = (...args: unknown[]) => unknown | Promise<unknown>;

/**
 * Enhanced extra data that includes transport info
 */
interface ExtendedExtraHandlerData extends ExtraHandlerData {
  _mcpTransport?: MCPTransport;
}

/**
 * Wraps transport methods for instrumentation
 */
export function wrapTransportMethods(transport: MCPTransport, requestTransportMap: Map<string | number, MCPTransport>): void {
  if (transport.onmessage) {
    fill(transport, 'onmessage', (originalOnMessage) => {
      return async function(this: MCPTransport, jsonRpcMessage: unknown, extra?: unknown) {

        if (isJsonRpcRequest(jsonRpcMessage)) {
          // Store transport → requestId mapping
          requestTransportMap.set(jsonRpcMessage.id, transport);
        }

        // Inject transport info into extra data for handler spans
        const extendedExtra: ExtendedExtraHandlerData = {
          ...(extra as ExtraHandlerData || {}),
          _mcpTransport: transport
        };

        // Only create spans for notifications - requests are handled at handler level
        if (isJsonRpcNotification(jsonRpcMessage)) {
          return createMcpNotificationSpan(jsonRpcMessage, this, extendedExtra, async () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            return originalOnMessage.call(this, jsonRpcMessage, extendedExtra);
          });
        }
        
        // For requests, just pass through with enhanced extra - spans are created in handlers
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalOnMessage.call(this, jsonRpcMessage, extendedExtra);
      };
    });
  }

  // Clean up request → transport mappings when the connection closes
  if (transport.onclose) {
    fill(transport, 'onclose', (originalOnClose) => {
      return function (this: MCPTransport, ...args: unknown[]) {
        for (const [reqId, mappedTransport] of requestTransportMap) {
          if (mappedTransport === this) {
            requestTransportMap.delete(reqId);
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalOnClose.call(this, ...args);
      };
    });
  }

  // Handle outgoing notifications
  if (transport.send) {
    fill(transport, 'send', (originalSend) => {
      return async function(this: MCPTransport, message: unknown, options?: unknown) {
        if (isJsonRpcNotification(message)) {
          return createMcpOutgoingNotificationSpan(message, this, async () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            return originalSend.call(this, message, options);
          });
        }
        
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalSend.call(this, message, options);
      };
    });
  }
}

/**
 * Wraps a handler callback to create a span for handler execution
 */
function wrapHandlerCallback(
  callback: McpHandlerCallback,
  handlerType: string,
  handlerName: string,
  requestTransportMap: Map<string | number, MCPTransport>,
): McpHandlerCallback {
  return function (this: unknown, ...args: unknown[]) {
    // Attempt to obtain the transport for this request via requestId
    const extra = args.find(
      (a): a is { requestId: string | number } =>
        typeof a === 'object' && a !== null && 'requestId' in a,
    );

    let transportForRequest: MCPTransport | undefined;
    if (extra?.requestId !== undefined) {
      transportForRequest = requestTransportMap.get(extra.requestId);
      // Clean up immediately – the span only needs it synchronously
      requestTransportMap.delete(extra.requestId);
    }

    if (transportForRequest) {
      // 5-arg overload: includes explicit transport
      return createMcpHandlerSpan(
        handlerType,
        handlerName,
        args,
        transportForRequest,
        async () => callback.apply(this, args),
      );
    }

    // 4-arg overload (back-compat) – transport will be picked up from extra
    return createMcpHandlerSpan(
      handlerType,
      handlerName,
      args,
      async () => callback.apply(this, args),
    );
  };
}

/**
 * Wraps handler registration methods to create spans for handler execution
 */
export function wrapHandlerMethods(serverInstance: MCPServerInstance, requestTransportMap: Map<string | number, MCPTransport>): void {
  // Wrap tool registration
  fill(serverInstance, 'tool', (originalTool) => {
    return function(this: MCPServerInstance, ...args: unknown[]) {
      const toolName = args[0] as string;
      const lastArg = args[args.length - 1];
      
      if (typeof lastArg !== 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalTool.apply(this, args);
      }

      const wrappedCallback = wrapHandlerCallback(lastArg as McpHandlerCallback, 'tool', toolName, requestTransportMap);
      const newArgs = [...args.slice(0, -1), wrappedCallback];
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalTool.apply(this, newArgs);
    };
  });

  // Wrap resource registration
  fill(serverInstance, 'resource', (originalResource) => {
    return function(this: MCPServerInstance, ...args: unknown[]) {
      const resourceUri = args[0] as string;
      const lastArg = args[args.length - 1];
      
      if (typeof lastArg !== 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalResource.apply(this, args);
      }

      const wrappedCallback = wrapHandlerCallback(lastArg as McpHandlerCallback, 'resource', resourceUri, requestTransportMap);
      const newArgs = [...args.slice(0, -1), wrappedCallback];
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalResource.apply(this, newArgs);
    };
  });

  // Wrap prompt registration
  fill(serverInstance, 'prompt', (originalPrompt) => {
    return function(this: MCPServerInstance, ...args: unknown[]) {
      const promptName = args[0] as string;
      const lastArg = args[args.length - 1];
      
      if (typeof lastArg !== 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalPrompt.apply(this, args);
      }

      const wrappedCallback = wrapHandlerCallback(lastArg as McpHandlerCallback, 'prompt', promptName, requestTransportMap);
      const newArgs = [...args.slice(0, -1), wrappedCallback];
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalPrompt.apply(this, newArgs);
    };
  });
} 