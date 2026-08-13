/**
 * Core attribute extraction and building functions for MCP server instrumentation
 */

import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  LEGACY_MCP_REQUEST_ID_ATTRIBUTE,
  MCP_CANCELLED_REASON_ATTRIBUTE,
  MCP_CANCELLED_REQUEST_ID_ATTRIBUTE,
  MCP_INPUT_RESPONSE_COUNT_ATTRIBUTE,
  MCP_LOGGING_DATA_TYPE_ATTRIBUTE,
  MCP_LOGGING_LEVEL_ATTRIBUTE,
  MCP_LOGGING_LOGGER_ATTRIBUTE,
  MCP_LOGGING_MESSAGE_ATTRIBUTE,
  MCP_LOGGING_REQUESTED_LEVEL_ATTRIBUTE,
  MCP_COMPLETION_REFERENCE_TYPE_ATTRIBUTE,
  MCP_PAGINATION_CURSOR_PRESENT_ATTRIBUTE,
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_REQUEST_STATE_PRESENT_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_PROGRESS_CURRENT_ATTRIBUTE,
  MCP_PROGRESS_MESSAGE_ATTRIBUTE,
  MCP_PROGRESS_PERCENTAGE_ATTRIBUTE,
  MCP_PROGRESS_TOTAL_ATTRIBUTE,
  MCP_SUBSCRIPTION_ID_ATTRIBUTE,
} from './attributes';
import { extractTargetInfo, getRequestArguments } from './methodConfig';
import { getBoundedMcpString, serializeMcpValue } from './serialization';
import type { JsonRpcNotification, JsonRpcRequest, McpAttributes, McpSpanType } from './types';

const MCP_LOG_LEVELS = new Set(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency']);
const PAGINATED_METHODS = new Set(['tools/list', 'resources/list', 'resources/templates/list', 'prompts/list']);

function getMcpToken(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? getBoundedMcpString(String(value)) : undefined;
}

/**
 * Formats logging data for span attributes
 * @internal
 */
function formatLoggingData(data: unknown): string {
  return serializeMcpValue(data) ?? '[unserializable]';
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
): McpAttributes {
  const attributes: McpAttributes = {};

  switch (method) {
    case 'notifications/cancelled':
      {
        const requestId = getMcpToken(params.requestId);
        if (requestId !== undefined) {
          attributes[MCP_CANCELLED_REQUEST_ID_ATTRIBUTE] = requestId;
        }
      }
      if (recordInputs && typeof params.reason === 'string') {
        attributes[MCP_CANCELLED_REASON_ATTRIBUTE] = getBoundedMcpString(params.reason);
      }
      break;

    case 'notifications/message':
      if (typeof params.level === 'string' && MCP_LOG_LEVELS.has(params.level)) {
        attributes[MCP_LOGGING_LEVEL_ATTRIBUTE] = params.level;
      }
      if (typeof params.logger === 'string') {
        attributes[MCP_LOGGING_LOGGER_ATTRIBUTE] = getBoundedMcpString(params.logger);
      }
      if (params?.data !== undefined) {
        attributes[MCP_LOGGING_DATA_TYPE_ATTRIBUTE] = typeof params.data;
        if (recordInputs) {
          attributes[MCP_LOGGING_MESSAGE_ATTRIBUTE] = formatLoggingData(params.data);
        }
      }
      break;

    case 'notifications/progress':
      if (typeof params.progress === 'number' && Number.isFinite(params.progress)) {
        attributes[MCP_PROGRESS_CURRENT_ATTRIBUTE] = params.progress;
      }
      if (typeof params.total === 'number' && Number.isFinite(params.total)) {
        attributes[MCP_PROGRESS_TOTAL_ATTRIBUTE] = params.total;
        if (typeof params.progress === 'number' && Number.isFinite(params.progress) && params.total !== 0) {
          attributes[MCP_PROGRESS_PERCENTAGE_ATTRIBUTE] = (params.progress / params.total) * 100;
        }
      }
      if (recordInputs && typeof params.message === 'string') {
        attributes[MCP_PROGRESS_MESSAGE_ATTRIBUTE] = getBoundedMcpString(params.message, 10_000);
      }
      break;

    case 'notifications/resources/updated':
      if (typeof params.uri === 'string') {
        attributes[MCP_RESOURCE_URI_ATTRIBUTE] = getBoundedMcpString(params.uri);
      }
      break;

    case 'notifications/initialized':
      attributes['mcp.lifecycle.phase'] = 'initialization_complete';
      attributes['mcp.protocol.ready'] = 1;
      break;
  }

  if (isNotificationSubscriptionId(params._meta)) {
    attributes[MCP_SUBSCRIPTION_ID_ATTRIBUTE] = getBoundedMcpString(
      String(params._meta['io.modelcontextprotocol/subscriptionId']),
    );
  }

  return attributes;
}

function isNotificationSubscriptionId(
  meta: unknown,
): meta is Record<'io.modelcontextprotocol/subscriptionId', string | number> {
  if (!meta || typeof meta !== 'object') {
    return false;
  }
  const subscriptionId = (meta as Record<string, unknown>)['io.modelcontextprotocol/subscriptionId'];
  return typeof subscriptionId === 'string' || typeof subscriptionId === 'number';
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
): McpAttributes {
  if (type === 'request') {
    const request = message as JsonRpcRequest;
    const targetInfo = extractTargetInfo(request.method, params || {});

    const inputResponses = params?.inputResponses;
    const meta = params?._meta;
    const requestedLogLevel =
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)['io.modelcontextprotocol/logLevel']
        : undefined;
    const completionReference =
      request.method === 'completion/complete' && params?.ref && typeof params.ref === 'object'
        ? (params.ref as Record<string, unknown>).type
        : undefined;

    return {
      ...(request.id !== undefined && {
        [MCP_REQUEST_ID_ATTRIBUTE]: getBoundedMcpString(String(request.id)),
        [LEGACY_MCP_REQUEST_ID_ATTRIBUTE]: getBoundedMcpString(String(request.id)),
      }),
      ...targetInfo.attributes,
      ...(request.method === 'tools/call' && { [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool' }),
      ...(inputResponses && typeof inputResponses === 'object' && !Array.isArray(inputResponses)
        ? { [MCP_INPUT_RESPONSE_COUNT_ATTRIBUTE]: Object.keys(inputResponses).length }
        : {}),
      ...(typeof params?.requestState === 'string' && { [MCP_REQUEST_STATE_PRESENT_ATTRIBUTE]: true }),
      ...(typeof requestedLogLevel === 'string' && MCP_LOG_LEVELS.has(requestedLogLevel)
        ? { [MCP_LOGGING_REQUESTED_LEVEL_ATTRIBUTE]: requestedLogLevel }
        : {}),
      ...(PAGINATED_METHODS.has(request.method) && typeof params?.cursor === 'string'
        ? { [MCP_PAGINATION_CURSOR_PRESENT_ATTRIBUTE]: true }
        : {}),
      ...(completionReference === 'ref/prompt' || completionReference === 'ref/resource'
        ? { [MCP_COMPLETION_REFERENCE_TYPE_ATTRIBUTE]: completionReference }
        : {}),
      ...(recordInputs ? getRequestArguments(request.method, params || {}) : {}),
    };
  }

  return getNotificationAttributes(message.method, params || {}, recordInputs);
}

// Re-export buildTransportAttributes for spans.ts
export { buildTransportAttributes } from './sessionExtraction';
