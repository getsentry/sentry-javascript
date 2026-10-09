/**
 * Core attribute extraction and building functions for MCP server instrumentation
 */

import {
  MCP_CANCELLED_REASON,
  MCP_CANCELLED_REQUEST_ID,
  MCP_LIFECYCLE_PHASE,
  MCP_LOGGING_DATA_TYPE,
  MCP_LOGGING_LEVEL,
  MCP_LOGGING_LOGGER,
  MCP_LOGGING_MESSAGE,
  MCP_PROGRESS_CURRENT,
  MCP_PROGRESS_MESSAGE,
  MCP_PROGRESS_PERCENTAGE,
  MCP_PROGRESS_TOKEN,
  MCP_PROGRESS_TOTAL,
  MCP_PROTOCOL_READY,
  MCP_REQUEST_ID,
  MCP_RESOURCE_PROTOCOL,
  MCP_RESOURCE_URI,
} from '@sentry/conventions/attributes';
import { isURLObjectRelative, parseStringToURLObject } from '../../utils/url';
import { extractTargetInfo, getRequestArguments } from './methodConfig';
import type { JsonRpcNotification, JsonRpcRequest, McpSpanType } from './types';

/**
 * Formats logging data for span attributes
 * @internal
 */
function formatLoggingData(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

/**
 * Extracts additional attributes for specific notification types
 * @param method - Notification method name
 * @param params - Notification parameters
 * @param recordInputs - Whether to include actual content or just metadata
 * @returns Method-specific attributes for span instrumentation
 */
export function getNotificationAttributes(
  method: string,
  params: Record<string, unknown>,
  recordInputs?: boolean,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  switch (method) {
    case 'notifications/cancelled':
      if (params?.requestId) {
        attributes[MCP_CANCELLED_REQUEST_ID] = String(params.requestId);
      }
      if (params?.reason) {
        attributes[MCP_CANCELLED_REASON] = String(params.reason);
      }
      break;

    case 'notifications/message':
      if (params?.level) {
        attributes[MCP_LOGGING_LEVEL] = String(params.level);
      }
      if (params?.logger) {
        attributes[MCP_LOGGING_LOGGER] = String(params.logger);
      }
      if (params?.data !== undefined) {
        attributes[MCP_LOGGING_DATA_TYPE] = typeof params.data;
        if (recordInputs) {
          attributes[MCP_LOGGING_MESSAGE] = formatLoggingData(params.data);
        }
      }
      break;

    case 'notifications/progress':
      if (params?.progressToken) {
        attributes[MCP_PROGRESS_TOKEN] = String(params.progressToken);
      }
      if (typeof params?.progress === 'number') {
        attributes[MCP_PROGRESS_CURRENT] = params.progress;
      }
      if (typeof params?.total === 'number') {
        attributes[MCP_PROGRESS_TOTAL] = params.total;
        if (typeof params?.progress === 'number') {
          attributes[MCP_PROGRESS_PERCENTAGE] = (params.progress / params.total) * 100;
        }
      }
      if (params?.message) {
        attributes[MCP_PROGRESS_MESSAGE] = String(params.message);
      }
      break;

    case 'notifications/resources/updated':
      if (params?.uri) {
        attributes[MCP_RESOURCE_URI] = String(params.uri);
        const urlObject = parseStringToURLObject(String(params.uri));
        if (urlObject && !isURLObjectRelative(urlObject)) {
          // oxlint-disable-next-line typescript/no-deprecated -- Keep the resource URI scheme distinct from the network protocol.
          attributes[MCP_RESOURCE_PROTOCOL] = urlObject.protocol.replace(':', '');
        }
      }
      break;

    case 'notifications/initialized':
      attributes[MCP_LIFECYCLE_PHASE] = 'initialization_complete';
      attributes[MCP_PROTOCOL_READY] = 1;
      break;
  }

  return attributes;
}

/**
 * Build type-specific attributes based on message type
 * @param type - Span type (request or notification)
 * @param message - JSON-RPC message
 * @param params - Optional parameters for attribute extraction
 * @param recordInputs - Whether to capture input arguments in spans
 * @returns Type-specific attributes for span instrumentation
 */
export function buildTypeSpecificAttributes(
  type: McpSpanType,
  message: JsonRpcRequest | JsonRpcNotification,
  params?: Record<string, unknown>,
  recordInputs?: boolean,
): Record<string, string | number> {
  if (type === 'request') {
    const request = message as JsonRpcRequest;
    const targetInfo = extractTargetInfo(request.method, params || {});

    return {
      // oxlint-disable-next-line typescript/no-deprecated -- Preserve the legacy request ID attribute for existing consumers.
      ...(request.id !== undefined && { [MCP_REQUEST_ID]: String(request.id) }),
      ...targetInfo.attributes,
      ...(recordInputs ? getRequestArguments(request.method, params || {}) : {}),
    };
  }

  return getNotificationAttributes(message.method, params || {}, recordInputs);
}

// Re-export buildTransportAttributes for spans.ts
export { buildTransportAttributes } from './sessionExtraction';
