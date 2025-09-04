/**
 * Core attribute extraction and building functions for MCP server instrumentation
 */

import { isURLObjectRelative, parseStringToURLObject } from '../../utils/url';
import {
  MCP_LOGGING_DATA_TYPE_ATTRIBUTE,
  MCP_LOGGING_LEVEL_ATTRIBUTE,
  MCP_LOGGING_LOGGER_ATTRIBUTE,
  MCP_LOGGING_MESSAGE_ATTRIBUTE,
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
} from './attributes';
import { extractTargetInfo, getRequestArguments } from './methodConfig';
import type { JsonRpcNotification, JsonRpcRequest, McpSpanType } from './types';

/**
 * Extracts additional attributes for specific notification types
 * @param method - Notification method name
 * @param params - Notification parameters
 * @returns Method-specific attributes for span instrumentation
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
        attributes[MCP_LOGGING_LEVEL_ATTRIBUTE] = String(params.level);
      }
      if (params?.logger) {
        attributes[MCP_LOGGING_LOGGER_ATTRIBUTE] = String(params.logger);
      }
      if (params?.data !== undefined) {
        attributes[MCP_LOGGING_DATA_TYPE_ATTRIBUTE] = typeof params.data;
        if (typeof params.data === 'string') {
          attributes[MCP_LOGGING_MESSAGE_ATTRIBUTE] = params.data;
        } else {
          attributes[MCP_LOGGING_MESSAGE_ATTRIBUTE] = JSON.stringify(params.data);
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
        attributes[MCP_RESOURCE_URI_ATTRIBUTE] = String(params.uri);
        const urlObject = parseStringToURLObject(String(params.uri));
        if (urlObject && !isURLObjectRelative(urlObject)) {
          attributes['mcp.resource.protocol'] = urlObject.protocol.replace(':', '');
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
 * Build type-specific attributes based on message type
 * @param type - Span type (request or notification)
 * @param message - JSON-RPC message
 * @param params - Optional parameters for attribute extraction
 * @returns Type-specific attributes for span instrumentation
 */
export function buildTypeSpecificAttributes(
  type: McpSpanType,
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

  return getNotificationAttributes(message.method, params || {});
}

// Re-export buildTransportAttributes for spans.ts
export { buildTransportAttributes } from './sessionExtraction';
