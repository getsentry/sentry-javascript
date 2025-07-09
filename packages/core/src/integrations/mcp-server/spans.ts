import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../semanticAttributes';
import { startSpan } from '../../tracing';
import {
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_FUNCTION_ORIGIN_VALUE,
  MCP_METHOD_NAME_ATTRIBUTE,
  MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE,
  MCP_NOTIFICATION_ORIGIN_VALUE,
  MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE,
  MCP_PROMPT_NAME_ATTRIBUTE,
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_ROUTE_SOURCE_VALUE,
  MCP_SERVER_OP_VALUE,
  MCP_SESSION_ID_ATTRIBUTE,
  MCP_TOOL_NAME_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
} from './attributes';
import {
  extractTargetInfo,
  getRequestArguments,
  getNotificationAttributes,
  extractClientInfo,
  extractHandlerArguments,
  extractToolResultAttributes,
} from './extraction';
import { classifyTransport, buildTransportAttrs, getTransportAttributesFromExtra } from './transport';
import type {
  ExtendedExtraHandlerData,
  ExtraHandlerData,
  JsonRpcNotification,
  JsonRpcRequest,
  McpSpanConfig,
  MCPTransport,
} from './types';

/**
 * Creates a span name based on the method and target
 */
function createSpanName(method: string, target?: string): string {
  return target ? `${method} ${target}` : method;
}

/**
 * Build transport and network attributes
 */
function buildTransportAttributes(transport: MCPTransport, extra?: ExtraHandlerData): Record<string, string | number> {
  const sessionId = transport.sessionId;
  const clientInfo = extra ? extractClientInfo(extra) : {};
  const transportInfo = classifyTransport(transport);

  return {
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientInfo.address && { [CLIENT_ADDRESS_ATTRIBUTE]: clientInfo.address }),
    ...(clientInfo.port && { [CLIENT_PORT_ATTRIBUTE]: clientInfo.port }),
    ...buildTransportAttrs(transportInfo),
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0',
  };
}

/**
 * Build type-specific attributes based on message type
 */
function buildTypeSpecificAttributes(
  type: McpSpanConfig['type'],
  message: JsonRpcRequest | JsonRpcNotification,
  params?: Record<string, unknown>,
): Record<string, string | number> {
  if (type === 'request') {
    const request = message as JsonRpcRequest;
    const targetInfo = extractTargetInfo(request.method, params || {});

    return {
      ...(request.id !== undefined && { [MCP_REQUEST_ID_ATTRIBUTE]: String(request.id) }),
      ...targetInfo.attributes,
      ...getRequestArguments(request.method, params || {}),
    };
  }

  // For notifications, only include notification-specific attributes
  return getNotificationAttributes(message.method, params || {});
}

/**
 * Build Sentry-specific attributes based on span type
 * Uses specific operations for notification direction
 */
function buildSentryAttributes(type: McpSpanConfig['type']): Record<string, string> {
  let op: string;
  let origin: string;

  switch (type) {
    case 'request':
      op = MCP_SERVER_OP_VALUE;
      origin = MCP_FUNCTION_ORIGIN_VALUE;
      break;
    case 'notification-incoming':
      op = MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      break;
    case 'notification-outgoing':
      op = MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      break;
  }

  return {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: MCP_ROUTE_SOURCE_VALUE,
  };
}

/**
 * Unified builder for creating MCP spans
 * Follows OpenTelemetry semantic conventions for span naming
 */
function createMcpSpan(config: McpSpanConfig): unknown {
  const { type, message, transport, extra, callback } = config;
  const { method } = message;
  const params = message.params as Record<string, unknown> | undefined;

  // Determine span name based on type and OTEL conventions
  let spanName: string;
  if (type === 'request') {
    const targetInfo = extractTargetInfo(method, params || {});
    spanName = createSpanName(method, targetInfo.target);
  } else {
    // For notifications, use method name directly per OpenTelemetry conventions
    spanName = method;
  }

  // Build attributes
  const attributes: Record<string, string | number> = {
    // Base attributes
    ...buildTransportAttributes(transport, extra),
    // Method name (required for all spans)
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    // Type-specific attributes
    ...buildTypeSpecificAttributes(type, message, params),
    // Sentry attributes
    ...buildSentryAttributes(type),
  };

  // Use startSpan with manual control to ensure proper async handling
  return startSpan(
    {
      name: spanName,
      forceTransaction: true,
      attributes,
    },
    callback,
  );
}

/**
 * Creates a span for incoming MCP notifications
 */
export function createMcpNotificationSpan(
  jsonRpcMessage: JsonRpcNotification,
  transport: MCPTransport,
  extra: ExtraHandlerData,
  callback: () => unknown,
): unknown {
  return createMcpSpan({
    type: 'notification-incoming',
    message: jsonRpcMessage,
    transport,
    extra,
    callback,
  });
}

/**
 * Creates a span for outgoing MCP notifications
 */
export function createMcpOutgoingNotificationSpan(
  jsonRpcMessage: JsonRpcNotification,
  transport: MCPTransport,
  callback: () => unknown,
): unknown {
  return createMcpSpan({
    type: 'notification-outgoing',
    message: jsonRpcMessage,
    transport,
    callback,
  });
}

/**
 * Creates a span for MCP handler execution (handler-level instrumentation)
 */
export function createMcpHandlerSpan(
  handlerType: string,
  handlerName: string,
  args: unknown[],
  transportOrCallback: MCPTransport | (() => unknown),
  maybeCallback?: () => unknown
): unknown {
  // Overload handling: if 4th arg is the callback (old signature) treat transport as undefined
  let transport: MCPTransport | undefined;
  let callback: () => unknown;

  if (typeof transportOrCallback === 'function') {
    callback = transportOrCallback as () => unknown;
  } else {
    transport = transportOrCallback as MCPTransport;
    callback = maybeCallback as () => unknown;
  }
  
  // Find the extra object with request metadata (including injected transport)
  const extra = args.find((arg): arg is ExtendedExtraHandlerData => 
    typeof arg === 'object' && 
    arg !== null && 
    'requestId' in arg
  );

  const methodName = `${handlerType}s/call`;
  const spanName = `${methodName} ${handlerName}`;

  // Build span attributes
  const attributes: Record<string, string | number> = {
    // Required MCP attributes
    [MCP_METHOD_NAME_ATTRIBUTE]: methodName,
    
    // Handler-specific attributes
    ...(handlerType === 'tool' && { [MCP_TOOL_NAME_ATTRIBUTE]: handlerName }),
    ...(handlerType === 'resource' && { [MCP_RESOURCE_URI_ATTRIBUTE]: handlerName }),
    ...(handlerType === 'prompt' && { [MCP_PROMPT_NAME_ATTRIBUTE]: handlerName }),
    
    // Session and request context
    ...(extra?.sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: extra.sessionId }),
    ...(extra?.requestId && { [MCP_REQUEST_ID_ATTRIBUTE]: String(extra.requestId) }),
    
    // Transport attributes: prefer explicit transport parameter, else fallback to extra
    ...(
      transport
        ? buildTransportAttrs(classifyTransport(transport))
        : getTransportAttributesFromExtra(extra)
    ),
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0',
    
    // Sentry attributes
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: MCP_SERVER_OP_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MCP_FUNCTION_ORIGIN_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: MCP_ROUTE_SOURCE_VALUE,
    
    // Handler arguments
    ...extractHandlerArguments(handlerType, args),
  };

  return startSpan(
    {
      name: spanName,
      forceTransaction: true,
      attributes,
    },
    async (span) => {
      try {
        const result = await callback();
        
        // For tool handlers, extract and add result attributes
        if (handlerType === 'tool') {
          const resultAttributes = extractToolResultAttributes(methodName, result);
          for (const [key, value] of Object.entries(resultAttributes)) {
            span.setAttribute(key, value);
          }
        }
        
        return result;
      } catch (error) {
        span.setStatus({ code: 2, message: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
      }
    }
  );
} 