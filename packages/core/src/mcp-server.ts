import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from './semanticAttributes';
import { startSpan, withActiveSpan } from './tracing';
import type { Span } from './types-hoist/span';
import { getActiveSpan } from './utils/spanUtils';
import {
  MCP_METHOD_NAME_ATTRIBUTE,
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_SESSION_ID_ATTRIBUTE,
  MCP_TRANSPORT_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_NOTIFICATION_DIRECTION_ATTRIBUTE,
  MCP_SERVER_OP_VALUE,
  MCP_FUNCTION_ORIGIN_VALUE,
  MCP_NOTIFICATION_ORIGIN_VALUE,
  MCP_ROUTE_SOURCE_VALUE,
} from './utils/mcp-server/attributes';
import type {
  JsonRpcRequest,
  JsonRpcNotification,
  MCPTransport,
  MCPServerInstance,
  SessionId,
  RequestId,
  ExtraHandlerData,
} from './utils/mcp-server/types';
import {
  isJsonRpcRequest,
  isJsonRpcNotification,
  extractTarget,
  getTargetAttributes,
  getRequestArguments,
  getTransportTypes,
  getNotificationDescription,
  getNotificationAttributes,
  extractClientAddress,
  extractClientPort,
  validateMcpServerInstance,
  createSpanName,
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
  serverInstance.connect = new Proxy(serverInstance.connect, {
    async apply(target, thisArg, argArray) {
      const [transport, ...restArgs] = argArray as [MCPTransport, ...unknown[]];

      // Call the original connect first to let Protocol set up its handlers
      const result = await Reflect.apply(target, thisArg, [transport, ...restArgs]);
      
      // Intercept incoming messages via onmessage
      if (transport.onmessage) {
        const protocolOnMessage = transport.onmessage;
        
        transport.onmessage = new Proxy(protocolOnMessage, {
          apply(onMessageTarget, onMessageThisArg, onMessageArgs) {
            const [jsonRpcMessage, extra] = onMessageArgs;
            
            // Instrument both requests and notifications
            if (isJsonRpcRequest(jsonRpcMessage)) {
              return createMcpServerSpan(jsonRpcMessage, transport, extra as ExtraHandlerData, () => {
                return onMessageTarget.apply(onMessageThisArg, onMessageArgs);
              });
            }
            if (isJsonRpcNotification(jsonRpcMessage)) {
              return createMcpNotificationSpan(jsonRpcMessage, transport, extra as ExtraHandlerData, () => {
                return onMessageTarget.apply(onMessageThisArg, onMessageArgs);
              });
            }
            
            return onMessageTarget.apply(onMessageThisArg, onMessageArgs);
          }
        });
      }

      // Intercept outgoing messages via send
      if (transport.send) {
        const originalSend = transport.send;
        
        transport.send = new Proxy(originalSend, {
          async apply(sendTarget, sendThisArg, sendArgs) {
            const [message, options] = sendArgs;
            
            // Instrument outgoing notifications (but not requests/responses)
            if (isJsonRpcNotification(message)) {
              return createMcpOutgoingNotificationSpan(message, transport, options as Record<string, unknown>, () => {
                return sendTarget.apply(sendThisArg, sendArgs);
              });
            }
            
            return sendTarget.apply(sendThisArg, sendArgs);
          }
        });
      }

      // Handle transport lifecycle events
      if (transport.onclose) {
        const originalOnClose = transport.onclose;
        transport.onclose = new Proxy(originalOnClose, {
          apply(onCloseTarget, onCloseThisArg, onCloseArgs) {
            if (transport.sessionId) {
              handleTransportOnClose(transport.sessionId);
            }
            return onCloseTarget.apply(onCloseThisArg, onCloseArgs);
          }
        });
      }
      return result;
    },
  });

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance as S;
}

function createMcpServerSpan(
  jsonRpcMessage: JsonRpcRequest,
  transport: MCPTransport,
  extra: ExtraHandlerData,
  callback: () => unknown
) {
  const { method, id: requestId, params } = jsonRpcMessage;
  
  // Extract target from method and params for proper description
  const target = extractTarget(method, params as Record<string, unknown>);
  const description = createSpanName(method, target);

  // Session ID should come from the transport itself, not the RPC message
  const sessionId = transport.sessionId;
  
  // Extract client information from extra/request data
  const clientAddress = extractClientAddress(extra);
  const clientPort = extractClientPort(extra);

  // Determine transport types
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  const attributes: Record<string, string | number> = {
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    
    ...(requestId !== undefined && { [MCP_REQUEST_ID_ATTRIBUTE]: String(requestId) }),
    ...(target && getTargetAttributes(method, target)),
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientAddress && { [CLIENT_ADDRESS_ATTRIBUTE]: clientAddress }),
    ...(clientPort && { [CLIENT_PORT_ATTRIBUTE]: clientPort }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport,           // Application level: "http", "sse", "stdio", "websocket"
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport,   // Network level: "tcp", "pipe", "udp", "quic"
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0',       // JSON-RPC version
    
    // Opt-in: Tool arguments (if enabled)
    ...getRequestArguments(method, params as Record<string, unknown>),
    
    // Sentry-specific attributes
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: MCP_SERVER_OP_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MCP_FUNCTION_ORIGIN_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: MCP_ROUTE_SOURCE_VALUE
  };

  return startSpan({
    name: description,
    forceTransaction: true,
    attributes
  }, () => {
    // TODO(bete): add proper error handling. Handle JSON RPC errors in the result
    return callback();
  });
}

function createMcpNotificationSpan(
  jsonRpcMessage: JsonRpcNotification,
  transport: MCPTransport,
  extra: ExtraHandlerData,
  callback: () => unknown
) {
  const { method, params } = jsonRpcMessage;
  
  const description = getNotificationDescription(method, params as Record<string, unknown>);
  
  const sessionId = transport.sessionId;
  
  // Extract client information
  const clientAddress = extractClientAddress(extra);
  const clientPort = extractClientPort(extra);

  // Determine transport types
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  const notificationAttribs = getNotificationAttributes(method, params as Record<string, unknown>);

  const attributes: Record<string, string | number> = {
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    [MCP_NOTIFICATION_DIRECTION_ATTRIBUTE]: 'client_to_server', // Incoming notification
    
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientAddress && { [CLIENT_ADDRESS_ATTRIBUTE]: clientAddress }),
    ...(clientPort && { [CLIENT_PORT_ATTRIBUTE]: clientPort }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport,
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport,
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0',
    
    // Notification-specific attributes
    ...notificationAttribs,
    
    // Sentry-specific attributes
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: MCP_SERVER_OP_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MCP_NOTIFICATION_ORIGIN_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: MCP_ROUTE_SOURCE_VALUE
  };

  return startSpan({
    name: description,
    forceTransaction: true,
    attributes
  }, () => {
    const result = callback();
    return result;
  });
}

function createMcpOutgoingNotificationSpan(
  jsonRpcMessage: JsonRpcNotification,
  transport: MCPTransport,
  options: Record<string, unknown>,
  callback: () => unknown
) {
  const { method, params } = jsonRpcMessage;
  
  const description = getNotificationDescription(method, params as Record<string, unknown>);
  
  const sessionId = transport.sessionId;
  
  // Determine transport types
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  const notificationAttribs = getNotificationAttributes(method, params as Record<string, unknown>);

  const attributes: Record<string, string | number> = {
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    [MCP_NOTIFICATION_DIRECTION_ATTRIBUTE]: 'server_to_client', // Outgoing notification
    
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport,
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport,
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0',
    
    // Notification-specific attributes
    ...notificationAttribs,
    
    // Sentry-specific attributes
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: MCP_SERVER_OP_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MCP_NOTIFICATION_ORIGIN_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: MCP_ROUTE_SOURCE_VALUE
  };

  return startSpan({
    name: description,
    forceTransaction: true,
    attributes
  }, () => {
    const result = callback();
    return result;
  });
}

// =============================================================================
// SESSION AND REQUEST CORRELATION (Legacy support)
// =============================================================================

interface ExtraHandlerDataWithRequestId {
  sessionId: SessionId;
  requestId: RequestId;
}

const sessionAndRequestToRequestParentSpanMap = new Map<SessionId, Map<RequestId, Span>>();

function handleTransportOnClose(sessionId: SessionId): void {
  sessionAndRequestToRequestParentSpanMap.delete(sessionId);
}

// TODO(bete): refactor this and associateContextWithRequestSpan to use the new span API.
function handleTransportOnMessage(sessionId: SessionId, requestId: RequestId): void {
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const requestIdToSpanMap = sessionAndRequestToRequestParentSpanMap.get(sessionId) ?? new Map();
    requestIdToSpanMap.set(requestId, activeSpan);
    sessionAndRequestToRequestParentSpanMap.set(sessionId, requestIdToSpanMap);
  }
}

function associateContextWithRequestSpan<T>(
  extraHandlerData: ExtraHandlerDataWithRequestId | undefined,
  cb: () => T,
): T {
  if (extraHandlerData) {
    const { sessionId, requestId } = extraHandlerData;
    const requestIdSpanMap = sessionAndRequestToRequestParentSpanMap.get(sessionId);

    if (!requestIdSpanMap) {
      return cb();
    }

    const span = requestIdSpanMap.get(requestId);
    if (!span) {
      return cb();
    }

    // remove the span from the map so it can be garbage collected
    requestIdSpanMap.delete(requestId);
    return withActiveSpan(span, () => {
      return cb();
    });
  }

  return cb();
}
