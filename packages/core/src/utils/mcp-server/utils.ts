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
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_ROUTE_SOURCE_VALUE,
  MCP_SERVER_OP_VALUE,
  MCP_SESSION_ID_ATTRIBUTE,
  MCP_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
} from './attributes';
import type { ExtraHandlerData, JsonRpcNotification, JsonRpcRequest, MCPTransport } from './types';

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 *
 */
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

/**
 *
 */
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

/**
 *
 */
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

// =============================================================================
// ATTRIBUTE EXTRACTION
// =============================================================================

/**
 *
 */
export function extractTarget(method: string, params: Record<string, unknown>): string | undefined {
  switch (method) {
    case 'tools/call':
      return typeof params?.name === 'string' ? params.name : undefined;
    case 'resources/read':
    case 'resources/subscribe':
    case 'resources/unsubscribe':
      return typeof params?.uri === 'string' ? params.uri : undefined;
    case 'prompts/get':
      return typeof params?.name === 'string' ? params.name : undefined;
    default:
      return undefined;
  }
}

/**
 *
 */
export function getTargetAttributes(method: string, target: string): Record<string, string> {
  switch (method) {
    case 'tools/call':
      return { 'mcp.tool.name': target };
    case 'resources/read':
    case 'resources/subscribe':
    case 'resources/unsubscribe':
      return { 'mcp.resource.uri': target };
    case 'prompts/get':
      return { 'mcp.prompt.name': target };
    default:
      return {};
  }
}

/**
 *
 */
export function getRequestArguments(method: string, params: Record<string, unknown>): Record<string, string> {
  const args: Record<string, string> = {};

  // Argument capture for different methods
  switch (method) {
    case 'tools/call':
      if (params?.arguments && typeof params.arguments === 'object') {
        for (const [key, value] of Object.entries(params.arguments as Record<string, unknown>)) {
          args[`mcp.request.argument.${key.toLowerCase()}`] = JSON.stringify(value);
        }
      }
      break;
    case 'resources/read':
      if (params?.uri) {
        args['mcp.request.argument.uri'] = JSON.stringify(params.uri);
      }
      break;
    case 'prompts/get':
      if (params?.name) {
        args['mcp.request.argument.name'] = JSON.stringify(params.name);
      }
      if (params?.arguments && typeof params.arguments === 'object') {
        for (const [key, value] of Object.entries(params.arguments as Record<string, unknown>)) {
          args[`mcp.request.argument.${key.toLowerCase()}`] = JSON.stringify(value);
        }
      }
      break;
  }

  return args;
}

// =============================================================================
// TRANSPORT DETECTION
// =============================================================================

/**
 *
 */
export function getTransportTypes(transport: MCPTransport): { mcpTransport: string; networkTransport: string } {
  const transportName = transport.constructor?.name?.toLowerCase() || '';

  if (transportName.includes('sse')) return { mcpTransport: 'sse', networkTransport: 'tcp' };
  if (transportName.includes('websocket')) return { mcpTransport: 'websocket', networkTransport: 'tcp' };
  if (transportName.includes('stdio')) return { mcpTransport: 'stdio', networkTransport: 'pipe' };

  return { mcpTransport: 'http', networkTransport: 'tcp' };
}

// =============================================================================
// NOTIFICATION HANDLING
// =============================================================================

/**
 * Get notification span name following OpenTelemetry conventions
 * For notifications, we use the method name directly as per JSON-RPC conventions
 */
export function getNotificationSpanName(method: string): string {
  return method;
}

/**
 * Extract additional attributes for specific notification types
 */
export function getNotificationAttributes(
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

// =============================================================================
// CLIENT INFO EXTRACTION
// =============================================================================

/**
 *
 */
export function extractClientAddress(extra: ExtraHandlerData): string | undefined {
  return (
    extra?.requestInfo?.remoteAddress ||
    extra?.clientAddress ||
    extra?.request?.ip ||
    extra?.request?.connection?.remoteAddress
  );
}

/**
 *
 */
export function extractClientPort(extra: ExtraHandlerData): number | undefined {
  return extra?.requestInfo?.remotePort || extra?.clientPort || extra?.request?.connection?.remotePort;
}

// =============================================================================
// SPAN NAMING
// =============================================================================

/**
 *
 */
export function createSpanName(method: string, target?: string): string {
  return target ? `${method} ${target}` : method;
}

// =============================================================================
// UNIFIED SPAN BUILDER
// =============================================================================

interface McpSpanConfig {
  type: 'request' | 'notification-incoming' | 'notification-outgoing';
  message: JsonRpcRequest | JsonRpcNotification;
  transport: MCPTransport;
  extra?: ExtraHandlerData;
  callback: () => unknown;
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
    const target = extractTarget(method, params || {});
    spanName = createSpanName(method, target);
  } else {
    // For notifications, use method name directly (OTEL convention)
    spanName = getNotificationSpanName(method);
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
  const clientAddress = extra ? extractClientAddress(extra) : undefined;
  const clientPort = extra ? extractClientPort(extra) : undefined;
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  return {
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientAddress && { [CLIENT_ADDRESS_ATTRIBUTE]: clientAddress }),
    ...(clientPort && { [CLIENT_PORT_ATTRIBUTE]: clientPort }),
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
    const target = extractTarget(request.method, params || {});
    
    return {
      ...(request.id !== undefined && { [MCP_REQUEST_ID_ATTRIBUTE]: String(request.id) }),
      ...(target && getTargetAttributes(request.method, target)),
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

// =============================================================================
// PUBLIC API - SIMPLIFIED SPAN CREATION FUNCTIONS
// =============================================================================

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
  options: Record<string, unknown>,
  callback: () => unknown,
): unknown {
  return createMcpSpan({
    type: 'notification-outgoing',
    message: jsonRpcMessage,
    transport,
    callback,
  });
}
