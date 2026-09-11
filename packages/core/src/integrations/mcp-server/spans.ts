/**
 * Span creation and management functions for MCP server instrumentation
 *
 * Provides unified span creation following OpenTelemetry MCP semantic conventions and our opinitionated take on MCP.
 * Handles both request and notification spans with attribute extraction.
 */

import { getClient } from '../../currentScopes';
import { SENTRY_OP, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import {
  MCP_NOTIFICATION_CLIENT_TO_SERVER,
  MCP_NOTIFICATION_SERVER_TO_CLIENT,
  MCP_SERVER,
} from '@sentry/conventions/op';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { hasSpanStreamingEnabled } from '../../tracing/spans/hasSpanStreamingEnabled';
import { MCP_NOTIFICATION_SPAN_NAME_FALLBACK, MCP_SERVER_SPAN_NAME_FALLBACK } from '../../tracing/spans/spanNames';
import { startSpan } from '../../tracing/trace';
import { buildTransportAttributes, buildTypeSpecificAttributes } from './attributeExtraction';
import {
  MCP_FUNCTION_ORIGIN_VALUE,
  MCP_METHOD_NAME_ATTRIBUTE,
  MCP_NOTIFICATION_ORIGIN_VALUE,
  MCP_ROUTE_SOURCE_VALUE,
} from './attributes';
import { extractTargetInfo } from './methodConfig';
import { filterMcpPiiFromSpanData } from './piiFiltering';
import type {
  ExtraHandlerData,
  JsonRpcNotification,
  JsonRpcRequest,
  McpSpanConfig,
  MCPTransport,
  ResolvedMcpOptions,
} from './types';

/**
 * Creates a span name based on the method and target
 * @internal
 * @param method - MCP method name
 * @param target - Optional target identifier
 * @returns Formatted span name
 */
function createSpanName(method: string, target?: string): string {
  return target ? `${method} ${target}` : method;
}

/**
 * Build Sentry-specific attributes based on span type
 * @internal
 * @param type - Span type configuration
 * @returns Sentry-specific attributes
 */
function buildSentryAttributes(type: McpSpanConfig['type']): Record<string, string> {
  let op: string;
  let origin: string;

  switch (type) {
    case 'request':
      op = MCP_SERVER;
      origin = MCP_FUNCTION_ORIGIN_VALUE;
      break;
    case 'notification-incoming':
      op = MCP_NOTIFICATION_CLIENT_TO_SERVER;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      break;
    case 'notification-outgoing':
      op = MCP_NOTIFICATION_SERVER_TO_CLIENT;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      break;
  }

  return {
    [SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SENTRY_SEGMENT_NAME_SOURCE]: MCP_ROUTE_SOURCE_VALUE,
  };
}

/**
 * Unified builder for creating MCP spans
 * @internal
 * @param config - Span configuration
 * @returns Created span
 */
function createMcpSpan(config: McpSpanConfig): unknown {
  const { type, message, transport, extra, callback, options } = config;
  const { method } = message;
  const params = message.params;
  const client = getClient();
  const spanStreamingEnabled = !!client && hasSpanStreamingEnabled(client);

  // Determine span name based on type and OTEL conventions
  let spanName: string;
  if (type === 'request') {
    const targetInfo = extractTargetInfo(method, params || {});
    const target = spanStreamingEnabled && !targetInfo.targetIsLowCardinality ? undefined : targetInfo.target;
    spanName = method ? createSpanName(method, target) : MCP_SERVER_SPAN_NAME_FALLBACK;
  } else {
    // For notifications, use method name directly per OpenTelemetry conventions.
    // With span streaming, span names have to be low cardinality, so a message without a method name gets a static name.
    spanName = method || (spanStreamingEnabled ? MCP_NOTIFICATION_SPAN_NAME_FALLBACK : method);
  }

  const rawAttributes: Record<string, string | number> = {
    ...buildTransportAttributes(transport, extra),
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    ...buildTypeSpecificAttributes(type, message, params, options?.recordInputs),
    ...buildSentryAttributes(type),
  };

  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const attributes = filterMcpPiiFromSpanData(rawAttributes, userInfo) as Record<string, string | number>;

  return startSpan(
    {
      name: spanName,
      // oxlint-disable-next-line typescript/no-deprecated
      forceTransaction: true,
      attributes,
    },
    callback,
  );
}

/**
 * Creates a span for incoming MCP notifications
 * @param jsonRpcMessage - Notification message
 * @param transport - MCP transport instance
 * @param extra - Extra handler data
 * @param options - Resolved MCP options
 * @param callback - Span execution callback
 * @returns Span execution result
 */
export function createMcpNotificationSpan(
  jsonRpcMessage: JsonRpcNotification,
  transport: MCPTransport,
  extra: ExtraHandlerData,
  options: ResolvedMcpOptions,
  callback: () => unknown,
): unknown {
  return createMcpSpan({
    type: 'notification-incoming',
    message: jsonRpcMessage,
    transport,
    extra,
    callback,
    options,
  });
}

/**
 * Creates a span for outgoing MCP notifications
 * @param jsonRpcMessage - Notification message
 * @param transport - MCP transport instance
 * @param options - Resolved MCP options
 * @param callback - Span execution callback
 * @returns Span execution result
 */
export function createMcpOutgoingNotificationSpan(
  jsonRpcMessage: JsonRpcNotification,
  transport: MCPTransport,
  options: ResolvedMcpOptions,
  callback: () => unknown,
): unknown {
  return createMcpSpan({
    type: 'notification-outgoing',
    message: jsonRpcMessage,
    transport,
    options,
    callback,
  });
}

/**
 * Builds span configuration for MCP server requests
 * @param jsonRpcMessage - Request message
 * @param transport - MCP transport instance
 * @param extra - Optional extra handler data
 * @param options - Resolved MCP options
 * @returns Span configuration object
 */
export function buildMcpServerSpanConfig(
  jsonRpcMessage: JsonRpcRequest,
  transport: MCPTransport,
  extra?: ExtraHandlerData,
  options?: ResolvedMcpOptions,
): {
  name: string;
  forceTransaction: boolean;
  attributes: Record<string, string | number>;
} {
  const { method } = jsonRpcMessage;
  const params = jsonRpcMessage.params;

  const client = getClient();
  const spanStreamingEnabled = !!client && hasSpanStreamingEnabled(client);

  const targetInfo = extractTargetInfo(method, params || {});
  const target = spanStreamingEnabled && !targetInfo.targetIsLowCardinality ? undefined : targetInfo.target;
  const spanName = method ? createSpanName(method, target) : MCP_SERVER_SPAN_NAME_FALLBACK;

  const rawAttributes: Record<string, string | number> = {
    ...buildTransportAttributes(transport, extra),
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    ...buildTypeSpecificAttributes('request', jsonRpcMessage, params, options?.recordInputs),
    ...buildSentryAttributes('request'),
  };

  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const attributes = filterMcpPiiFromSpanData(rawAttributes, userInfo) as Record<string, string | number>;

  return {
    name: spanName,
    forceTransaction: true,
    attributes,
  };
}
