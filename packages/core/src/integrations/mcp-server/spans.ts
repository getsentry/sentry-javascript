/**
 * Span creation and management functions for MCP server instrumentation
 */

import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../semanticAttributes';
import { startSpan } from '../../tracing';
import { buildTransportAttributes, buildTypeSpecificAttributes, extractTargetInfo } from './attributeExtraction';
import {
  MCP_FUNCTION_ORIGIN_VALUE,
  MCP_METHOD_NAME_ATTRIBUTE,
  MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE,
  MCP_NOTIFICATION_ORIGIN_VALUE,
  MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE,
  MCP_ROUTE_SOURCE_VALUE,
  MCP_SERVER_OP_VALUE,
} from './attributes';
import type { ExtraHandlerData, JsonRpcNotification, JsonRpcRequest, McpSpanConfig, MCPTransport } from './types';

/**
 * Creates a span name based on the method and target
 */
function createSpanName(method: string, target?: string): string {
  return target ? `${method} ${target}` : method;
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
 * Builds span configuration for MCP server requests
 * Used for deferred span completion pattern
 */
export function buildMcpServerSpanConfig(
  jsonRpcMessage: JsonRpcRequest,
  transport: MCPTransport,
  extra?: ExtraHandlerData,
): {
  name: string;
  op: string;
  forceTransaction: boolean;
  attributes: Record<string, string | number>;
} {
  const { method } = jsonRpcMessage;
  const params = jsonRpcMessage.params as Record<string, unknown> | undefined;

  // Extract target for span name
  const targetInfo = extractTargetInfo(method, params || {});
  const spanName = createSpanName(method, targetInfo.target);

  // Build comprehensive attributes
  const attributes: Record<string, string | number> = {
    // Base attributes
    ...buildTransportAttributes(transport, extra),
    // Method and request info
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    // Type-specific attributes
    ...buildTypeSpecificAttributes('request', jsonRpcMessage, params),
    // Sentry attributes
    ...buildSentryAttributes('request'),
  };

  return {
    name: spanName,
    op: MCP_SERVER_OP_VALUE,
    forceTransaction: true,
    attributes,
  };
}
