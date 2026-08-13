/**
 * Span creation and management functions for MCP server instrumentation
 *
 * Provides unified span creation following OpenTelemetry MCP semantic conventions and our opinitionated take on MCP.
 * Handles both request and notification spans with attribute extraction.
 */

import { getClient } from '../../currentScopes';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { startInactiveSpan, startSpan } from '../../tracing';
import type { SpanLink } from '../../types/link';
import type { Span } from '../../types/span';
import type { StartSpanOptions } from '../../types/startSpanOptions';
import { buildTransportAttributes, buildTypeSpecificAttributes } from './attributeExtraction';
import {
  MCP_FUNCTION_ORIGIN_VALUE,
  MCP_METHOD_NAME_ATTRIBUTE,
  MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE,
  MCP_NOTIFICATION_ORIGIN_VALUE,
  MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE,
  MCP_SERVER_OP_VALUE,
  SENTRY_KIND_ATTRIBUTE,
} from './attributes';
import { extractTargetInfo } from './methodConfig';
import { filterMcpPiiFromSpanData } from './piiFiltering';
import { getBoundedMcpString } from './serialization';
import type {
  ExtraHandlerData,
  JsonRpcNotification,
  JsonRpcRequest,
  McpAttributes,
  McpSpanConfig,
  MCPTransport,
  ResolvedMcpOptions,
  SessionData,
} from './types';

const MCP_CLIENT_OP_VALUE = 'mcp.client';

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
  let spanKind: 'client' | 'server';

  switch (type) {
    case 'request':
      op = MCP_SERVER_OP_VALUE;
      origin = MCP_FUNCTION_ORIGIN_VALUE;
      spanKind = 'server';
      break;
    case 'request-outgoing':
      op = MCP_CLIENT_OP_VALUE;
      origin = MCP_FUNCTION_ORIGIN_VALUE;
      spanKind = 'client';
      break;
    case 'notification-incoming':
      op = MCP_NOTIFICATION_CLIENT_TO_SERVER_OP_VALUE;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      spanKind = 'server';
      break;
    case 'notification-outgoing':
      op = MCP_NOTIFICATION_SERVER_TO_CLIENT_OP_VALUE;
      origin = MCP_NOTIFICATION_ORIGIN_VALUE;
      spanKind = 'client';
      break;
  }

  return {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SENTRY_KIND_ATTRIBUTE]: spanKind,
  };
}

/**
 * Unified builder for creating MCP spans
 * @internal
 * @param config - Span configuration
 * @returns Created span
 */
function createMcpSpan(config: McpSpanConfig): unknown {
  const { type, message, transport, extra, callback, options, operationSessionData, links, parentSpan } = config;
  const method = getBoundedMcpString(message.method);
  const params = message.params;

  // Determine span name based on type and OTEL conventions
  let spanName: string;
  if (type === 'request' || type === 'request-outgoing') {
    const targetInfo = extractTargetInfo(method, params || {});
    spanName = createSpanName(method, targetInfo.includeTargetInSpanName ? targetInfo.target : undefined);
  } else {
    // For notifications, use method name directly per OpenTelemetry conventions
    spanName = method;
  }

  const rawAttributes: McpAttributes = {
    ...buildTransportAttributes(transport, extra, operationSessionData),
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    ...buildTypeSpecificAttributes(
      type === 'request-outgoing' ? 'request' : type,
      message,
      params,
      options?.recordInputs,
    ),
    ...buildSentryAttributes(type),
  };

  const client = getClient();
  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const attributes = filterMcpPiiFromSpanData(rawAttributes, userInfo);
  const spanOptions: StartSpanOptions = { name: spanName, attributes };
  if (links) {
    spanOptions.links = links;
  }
  if (parentSpan) {
    spanOptions.parentSpan = parentSpan;
  }

  return startSpan(spanOptions, callback);
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
  operationSessionData?: SessionData,
  links?: SpanLink[],
  parentSpan?: Span,
): unknown {
  return createMcpSpan({
    type: 'notification-incoming',
    message: jsonRpcMessage,
    transport,
    extra,
    callback,
    options,
    operationSessionData,
    links,
    parentSpan,
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
  operationSessionData?: SessionData,
  parentSpan?: Span,
): unknown {
  return createMcpSpan({
    type: 'notification-outgoing',
    message: jsonRpcMessage,
    transport,
    options,
    callback,
    operationSessionData,
    parentSpan,
  });
}

/** Creates a long-lived client span for a server-to-client request. */
export function createMcpOutgoingRequestSpan(
  jsonRpcMessage: JsonRpcRequest,
  transport: MCPTransport,
  options: ResolvedMcpOptions,
  operationSessionData?: SessionData,
  parentSpan?: Span,
): Span {
  const { params } = jsonRpcMessage;
  const method = getBoundedMcpString(jsonRpcMessage.method);
  const targetInfo = extractTargetInfo(method, params || {});
  const rawAttributes: McpAttributes = {
    ...buildTransportAttributes(transport, undefined, operationSessionData),
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    ...buildTypeSpecificAttributes('request', jsonRpcMessage, params, options.recordInputs),
    ...buildSentryAttributes('request-outgoing'),
  };
  const client = getClient();
  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const spanOptions: StartSpanOptions = {
    name: createSpanName(method, targetInfo.includeTargetInSpanName ? targetInfo.target : undefined),
    op: MCP_CLIENT_OP_VALUE,
    attributes: filterMcpPiiFromSpanData(rawAttributes, userInfo),
  };
  if (parentSpan) {
    spanOptions.parentSpan = parentSpan;
  }

  return startInactiveSpan(spanOptions);
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
  operationSessionData?: SessionData,
  links?: SpanLink[],
  parentSpan?: Span,
): StartSpanOptions {
  const method = getBoundedMcpString(jsonRpcMessage.method);
  const params = jsonRpcMessage.params;

  const targetInfo = extractTargetInfo(method, params || {});
  const spanName = createSpanName(method, targetInfo.includeTargetInSpanName ? targetInfo.target : undefined);

  const rawAttributes: McpAttributes = {
    ...buildTransportAttributes(transport, extra, operationSessionData),
    [MCP_METHOD_NAME_ATTRIBUTE]: method,
    ...buildTypeSpecificAttributes('request', jsonRpcMessage, params, options?.recordInputs),
    ...buildSentryAttributes('request'),
  };

  const client = getClient();
  const userInfo = Boolean(client?.getDataCollectionOptions().userInfo);
  const attributes = filterMcpPiiFromSpanData(rawAttributes, userInfo);

  const spanOptions: StartSpanOptions = {
    name: spanName,
    op: MCP_SERVER_OP_VALUE,
    attributes,
  };
  if (links) {
    spanOptions.links = links;
  }
  if (parentSpan) {
    spanOptions.parentSpan = parentSpan;
  }
  return spanOptions;
}
