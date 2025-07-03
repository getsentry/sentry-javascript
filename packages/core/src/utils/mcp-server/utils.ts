/**
 * Essential utility functions for MCP server instrumentation
 */

import { DEBUG_BUILD } from '../../debug-build';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../semanticAttributes';
import { startSpan } from '../../tracing';
import { logger } from '../logger';
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
  MCP_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
} from './attributes';
import type { ExtraHandlerData, JsonRpcNotification, JsonRpcRequest, McpSpanConfig, MCPTransport, MethodConfig } from './types';

/** Validates if a message is a JSON-RPC request */
export function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as JsonRpcRequest).jsonrpc === '2.0' &&
    'method' in message &&
    'id' in message
  );
}

/** Validates if a message is a JSON-RPC notification */
export function isJsonRpcNotification(message: unknown): message is JsonRpcNotification {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as JsonRpcNotification).jsonrpc === '2.0' &&
    'method' in message &&
    !('id' in message)
  );
}

/** Validates MCP server instance with comprehensive type checking */
export function validateMcpServerInstance(instance: unknown): boolean {
  if (
    typeof instance === 'object' &&
    instance !== null &&
    'resource' in instance &&
    'tool' in instance &&
    'prompt' in instance &&
    'connect' in instance
  ) {
    return true;
  }
  DEBUG_BUILD && logger.warn('Did not patch MCP server. Interface is incompatible.');
  return false;
}

/** Configuration for MCP methods to extract targets and arguments */
const METHOD_CONFIGS: Record<string, MethodConfig> = {
  'tools/call': {
    targetField: 'name',
    targetAttribute: MCP_TOOL_NAME_ATTRIBUTE,
    captureArguments: true,
    argumentsField: 'arguments',
  },
  'resources/read': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI_ATTRIBUTE,
    captureUri: true,
  },
  'resources/subscribe': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI_ATTRIBUTE,
  },
  'resources/unsubscribe': {
    targetField: 'uri',
    targetAttribute: MCP_RESOURCE_URI_ATTRIBUTE,
  },
  'prompts/get': {
    targetField: 'name',
    targetAttribute: MCP_PROMPT_NAME_ATTRIBUTE,
    captureName: true,
    captureArguments: true,
    argumentsField: 'arguments',
  },
};

/** Extracts target info from method and params based on method type */
function extractTargetInfo(method: string, params: Record<string, unknown>): { 
  target?: string; 
  attributes: Record<string, string> 
} {
  const config = METHOD_CONFIGS[method as keyof typeof METHOD_CONFIGS];
  if (!config) {
    return { attributes: {} };
  }

  const target = config.targetField && typeof params?.[config.targetField] === 'string' 
    ? params[config.targetField] as string 
    : undefined;

  return {
    target,
    attributes: target && config.targetAttribute ? { [config.targetAttribute]: target } : {}
  };
}

/** Extracts request arguments based on method type */
function getRequestArguments(method: string, params: Record<string, unknown>): Record<string, string> {
  const args: Record<string, string> = {};
  const config = METHOD_CONFIGS[method as keyof typeof METHOD_CONFIGS];
  
  if (!config) {
    return args;
  }

  // Capture arguments from the configured field
  if (config.captureArguments && config.argumentsField && params?.[config.argumentsField]) {
    const argumentsObj = params[config.argumentsField];
    if (typeof argumentsObj === 'object' && argumentsObj !== null) {
      for (const [key, value] of Object.entries(argumentsObj as Record<string, unknown>)) {
        args[`mcp.request.argument.${key.toLowerCase()}`] = JSON.stringify(value);
      }
    }
  }

  // Capture specific fields as arguments
  if (config.captureUri && params?.uri) {
    args['mcp.request.argument.uri'] = JSON.stringify(params.uri);
  }

  if (config.captureName && params?.name) {
    args['mcp.request.argument.name'] = JSON.stringify(params.name);
  }

  return args;
}

/** Extracts transport types based on transport constructor name */
function getTransportTypes(transport: MCPTransport): { mcpTransport: string; networkTransport: string } {
  const transportName = transport.constructor?.name?.toLowerCase() || '';

  // Standard MCP transports per specification
  if (transportName.includes('stdio')) {
    return { mcpTransport: 'stdio', networkTransport: 'pipe' };
  }
  
  // Streamable HTTP is the standard HTTP-based transport
  // The official SDK uses 'StreamableHTTPServerTransport' / 'StreamableHTTPClientTransport'
  if (transportName.includes('streamablehttp') || transportName.includes('streamable')) {
    return { mcpTransport: 'http', networkTransport: 'tcp' };
  }
  
  // SSE is the deprecated HTTP+SSE transport (backwards compatibility)
  // Note: Modern Streamable HTTP can use SSE internally, but SSE transport is deprecated
  if (transportName.includes('sse')) {
    return { mcpTransport: 'sse', networkTransport: 'tcp' };
  }

  // For custom transports, mark as unknown
  // TODO(bete): Add support for custom transports
  return { mcpTransport: 'unknown', networkTransport: 'unknown' };
}

/** Extracts additional attributes for specific notification types */
function getNotificationAttributes(
  method: string,
  params: Record<string, unknown>,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  switch (method) {
    case 'notifications/cancelled':
      if (params?.requestId) {
        attributes['mcp.cancelled.request_id'] = String(params.requestId);
      }
      if (params?.reason) {
        attributes['mcp.cancelled.reason'] = String(params.reason);
      }
      break;

    case 'notifications/message':
      if (params?.level) {
        attributes['mcp.logging.level'] = String(params.level);
      }
      if (params?.logger) {
        attributes['mcp.logging.logger'] = String(params.logger);
      }
      if (params?.data !== undefined) {
        attributes['mcp.logging.data_type'] = typeof params.data;
        // Store the actual message content
        if (typeof params.data === 'string') {
          attributes['mcp.logging.message'] = params.data;
        } else {
          attributes['mcp.logging.message'] = JSON.stringify(params.data);
        }
      }
      break;

    case 'notifications/progress':
      if (params?.progressToken) {
        attributes['mcp.progress.token'] = String(params.progressToken);
      }
      if (typeof params?.progress === 'number') {
        attributes['mcp.progress.current'] = params.progress;
      }
      if (typeof params?.total === 'number') {
        attributes['mcp.progress.total'] = params.total;
        if (typeof params?.progress === 'number') {
          attributes['mcp.progress.percentage'] = (params.progress / params.total) * 100;
        }
      }
      if (params?.message) {
        attributes['mcp.progress.message'] = String(params.message);
      }
      break;

    case 'notifications/resources/updated':
      if (params?.uri) {
        attributes['mcp.resource.uri'] = String(params.uri);
        // Extract protocol from URI
        try {
          const url = new URL(String(params.uri));
          attributes['mcp.resource.protocol'] = url.protocol;
        } catch {
          // Ignore invalid URIs
        }
      }
      break;

    case 'notifications/initialized':
      attributes['mcp.lifecycle.phase'] = 'initialization_complete';
      attributes['mcp.protocol.ready'] = 1;
      break;
  }

  return attributes;
}


/**
 * Creates a span name based on the method and target
 */
function createSpanName(method: string, target?: string): string {
  return target ? `${method} ${target}` : method;
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
 * Build transport and network attributes
 */
function buildTransportAttributes(
  transport: MCPTransport,
  extra?: ExtraHandlerData,
): Record<string, string | number> {
  const sessionId = transport.sessionId;
  const clientInfo = extra ? extractClientInfo(extra) : {};
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  return {
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientInfo.address && { [CLIENT_ADDRESS_ATTRIBUTE]: clientInfo.address }),
    ...(clientInfo.port && { [CLIENT_PORT_ATTRIBUTE]: clientInfo.port }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport,
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport,
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
 * Creates a span for MCP server request handling
 */
export function createMcpServerSpan(
  jsonRpcMessage: JsonRpcRequest,
  transport: MCPTransport,
  extra: ExtraHandlerData,
  callback: () => unknown,
): unknown {
  return createMcpSpan({
    type: 'request',
    message: jsonRpcMessage,
    transport,
    extra,
    callback,
  });
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
 * Combine the two extraction functions into one
 */
function extractClientInfo(extra: ExtraHandlerData): { 
  address?: string; 
  port?: number 
} {
  return {
    address: extra?.requestInfo?.remoteAddress ||
             extra?.clientAddress ||
             extra?.request?.ip ||
             extra?.request?.connection?.remoteAddress,
    port: extra?.requestInfo?.remotePort || 
          extra?.clientPort || 
          extra?.request?.connection?.remotePort
  };
}
