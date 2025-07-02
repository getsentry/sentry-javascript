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
  MCP_NOTIFICATION_DIRECTION_ATTRIBUTE,
  MCP_NOTIFICATION_ORIGIN_VALUE,
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
 *
 */
export function getNotificationDescription(method: string, params: Record<string, unknown>): string {
  // Enhanced description with target information
  switch (method) {
    case 'notifications/message':
      // For logging messages, include logger in description
      if (params?.logger && typeof params.logger === 'string') {
        return `${method} logger:${params.logger}`;
      }
      return method;
    case 'notifications/cancelled':
      // For cancelled notifications, include request ID if available
      if (params?.requestId) {
        return `${method} request:${params.requestId}`;
      }
      return method;
    case 'notifications/progress':
      // For progress notifications, include progress token if available
      if (params?.progressToken) {
        return `${method} token:${params.progressToken}`;
      }
      return method;
    case 'notifications/resources/updated':
      // For resource updates, include URI
      if (params?.uri && typeof params.uri === 'string') {
        return `${method} ${params.uri}`;
      }
      return method;
    default:
      return method;
  }
}

/**
 *
 */
export function getNotificationAttributes(
  method: string,
  params: Record<string, unknown>,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  // Comprehensive notification attributes
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
      // Logging-specific attributes
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
      // Mark as lifecycle event
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
// SPAN ATTRIBUTE BUILDERS
// =============================================================================

/**
 * Builds base span attributes common to all MCP span types
 */
export function buildBaseSpanAttributes(
  transport: MCPTransport,
  extra?: ExtraHandlerData,
): Record<string, string | number> {
  // Session ID should come from the transport itself, not the RPC message
  const sessionId = transport.sessionId;

  // Extract client information from extra/request data (if provided)
  const clientAddress = extra ? extractClientAddress(extra) : undefined;
  const clientPort = extra ? extractClientPort(extra) : undefined;

  // Determine transport types
  const { mcpTransport, networkTransport } = getTransportTypes(transport);

  return {
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientAddress && { [CLIENT_ADDRESS_ATTRIBUTE]: clientAddress }),
    ...(clientPort && { [CLIENT_PORT_ATTRIBUTE]: clientPort }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport, // Application level: "http", "sse", "stdio", "websocket"
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport, // Network level: "tcp", "pipe", "udp", "quic"
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0', // JSON-RPC version
  };
}

/**
 * Builds Sentry-specific span attributes
 */
export function buildSentrySpanAttributes(origin: string): Record<string, string> {
  return {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: MCP_SERVER_OP_VALUE,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: MCP_ROUTE_SOURCE_VALUE,
  };
}

// =============================================================================
// SPAN CREATION FUNCTIONS
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
  const { method, id: requestId, params } = jsonRpcMessage;

  // Extract target from method and params for proper description
  const target = extractTarget(method, params as Record<string, unknown>);
  const description = createSpanName(method, target);

  // Build base attributes using shared builder
  const baseAttributes = buildBaseSpanAttributes(transport, extra);

  // Build request-specific attributes
  const requestAttributes: Record<string, string | number> = {
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    ...(requestId !== undefined && { [MCP_REQUEST_ID_ATTRIBUTE]: String(requestId) }),
    ...(target && getTargetAttributes(method, target)),
    // Opt-in: Tool arguments (if enabled)
    ...getRequestArguments(method, params as Record<string, unknown>),
  };

  // Build Sentry-specific attributes using shared builder
  const sentryAttributes = buildSentrySpanAttributes(MCP_FUNCTION_ORIGIN_VALUE);

  return startSpan(
    {
      name: description,
      forceTransaction: true,
      attributes: {
        ...baseAttributes,
        ...requestAttributes,
        ...sentryAttributes,
      },
    },
    () => {
      // TODO(bete): add proper error handling. Handle JSON RPC errors in the result
      return callback();
    },
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
  const { method, params } = jsonRpcMessage;

  const description = getNotificationDescription(method, params as Record<string, unknown>);

  // Build base attributes using shared builder
  const baseAttributes = buildBaseSpanAttributes(transport, extra);

  // Build notification-specific attributes
  const notificationAttributes: Record<string, string | number> = {
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    [MCP_NOTIFICATION_DIRECTION_ATTRIBUTE]: 'client_to_server', // Incoming notification
    // Notification-specific attributes
    ...getNotificationAttributes(method, params as Record<string, unknown>),
  };

  // Build Sentry-specific attributes using shared builder
  const sentryAttributes = buildSentrySpanAttributes(MCP_NOTIFICATION_ORIGIN_VALUE);

  return startSpan(
    {
      name: description,
      forceTransaction: true,
      attributes: {
        ...baseAttributes,
        ...notificationAttributes,
        ...sentryAttributes,
      },
    },
    () => {
      const result = callback();
      return result;
    },
  );
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
  const { method, params } = jsonRpcMessage;

  const description = getNotificationDescription(method, params as Record<string, unknown>);

  // Build base attributes using shared builder (no client info for outgoing notifications)
  const baseAttributes = buildBaseSpanAttributes(transport);

  // Build notification-specific attributes
  const notificationAttributes: Record<string, string | number> = {
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    [MCP_NOTIFICATION_DIRECTION_ATTRIBUTE]: 'server_to_client', // Outgoing notification
    // Notification-specific attributes
    ...getNotificationAttributes(method, params as Record<string, unknown>),
  };

  // Build Sentry-specific attributes using shared builder
  const sentryAttributes = buildSentrySpanAttributes(MCP_NOTIFICATION_ORIGIN_VALUE);

  return startSpan(
    {
      name: description,
      forceTransaction: true,
      attributes: {
        ...baseAttributes,
        ...notificationAttributes,
        ...sentryAttributes,
      },
    },
    () => {
      const result = callback();
      return result;
    },
  );
}
