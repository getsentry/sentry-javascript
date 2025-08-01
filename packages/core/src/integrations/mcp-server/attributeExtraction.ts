/**
 * Attribute extraction and building functions for MCP server instrumentation
 */

import { isURLObjectRelative, parseStringToURLObject } from '../../utils/url';
import {
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_LOGGING_DATA_TYPE_ATTRIBUTE,
  MCP_LOGGING_LEVEL_ATTRIBUTE,
  MCP_LOGGING_LOGGER_ATTRIBUTE,
  MCP_LOGGING_MESSAGE_ATTRIBUTE,
  MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE,
  MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE,
  MCP_PROTOCOL_VERSION_ATTRIBUTE,
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_SERVER_NAME_ATTRIBUTE,
  MCP_SERVER_TITLE_ATTRIBUTE,
  MCP_SERVER_VERSION_ATTRIBUTE,
  MCP_SESSION_ID_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE,
  MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE,
  MCP_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
} from './attributes';
import { extractTargetInfo, getRequestArguments } from './methodConfig';
import {
  getClientInfoForTransport,
  getProtocolVersionForTransport,
  getSessionDataForTransport,
} from './sessionManagement';
import type {
  ExtraHandlerData,
  JsonRpcNotification,
  JsonRpcRequest,
  McpSpanType,
  MCPTransport,
  PartyInfo,
  SessionData,
} from './types';

/**
 * Extracts transport types based on transport constructor name
 * @param transport - MCP transport instance
 * @returns Transport type mapping for span attributes
 */
export function getTransportTypes(transport: MCPTransport): { mcpTransport: string; networkTransport: string } {
  const transportName = transport.constructor?.name?.toLowerCase() || '';

  if (transportName.includes('stdio')) {
    return { mcpTransport: 'stdio', networkTransport: 'pipe' };
  }

  if (transportName.includes('streamablehttp') || transportName.includes('streamable')) {
    return { mcpTransport: 'http', networkTransport: 'tcp' };
  }

  if (transportName.includes('sse')) {
    return { mcpTransport: 'sse', networkTransport: 'tcp' };
  }

  return { mcpTransport: 'unknown', networkTransport: 'unknown' };
}

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
 * Extracts and validates PartyInfo from an unknown object
 * @param obj - Unknown object that might contain party info
 * @returns Validated PartyInfo object with only string properties
 */
function extractPartyInfo(obj: unknown): PartyInfo {
  const partyInfo: PartyInfo = {};

  if (obj && typeof obj === 'object' && obj !== null) {
    const source = obj as Record<string, unknown>;
    if (typeof source.name === 'string') partyInfo.name = source.name;
    if (typeof source.title === 'string') partyInfo.title = source.title;
    if (typeof source.version === 'string') partyInfo.version = source.version;
  }

  return partyInfo;
}

/**
 * Extracts session data from "initialize" requests
 * @param request - JSON-RPC "initialize" request containing client info and protocol version
 * @returns Session data extracted from request parameters including protocol version and client info
 */
export function extractSessionDataFromInitializeRequest(request: JsonRpcRequest): SessionData {
  const sessionData: SessionData = {};
  if (request.params && typeof request.params === 'object' && request.params !== null) {
    const params = request.params as Record<string, unknown>;
    if (typeof params.protocolVersion === 'string') {
      sessionData.protocolVersion = params.protocolVersion;
    }
    if (params.clientInfo) {
      sessionData.clientInfo = extractPartyInfo(params.clientInfo);
    }
  }
  return sessionData;
}

/**
 * Extracts session data from "initialize" response
 * @param result - "initialize" response result containing server info and protocol version
 * @returns Partial session data extracted from response including protocol version and server info
 */
export function extractSessionDataFromInitializeResponse(result: unknown): Partial<SessionData> {
  const sessionData: Partial<SessionData> = {};
  if (result && typeof result === 'object') {
    const resultObj = result as Record<string, unknown>;
    if (typeof resultObj.protocolVersion === 'string') sessionData.protocolVersion = resultObj.protocolVersion;
    if (resultObj.serverInfo) {
      sessionData.serverInfo = extractPartyInfo(resultObj.serverInfo);
    }
  }
  return sessionData;
}

/**
 * Build client attributes from stored client info
 * @param transport - MCP transport instance
 * @returns Client attributes for span instrumentation
 */
export function getClientAttributes(transport: MCPTransport): Record<string, string> {
  const clientInfo = getClientInfoForTransport(transport);
  const attributes: Record<string, string> = {};

  if (clientInfo?.name) {
    attributes['mcp.client.name'] = clientInfo.name;
  }
  if (clientInfo?.title) {
    attributes['mcp.client.title'] = clientInfo.title;
  }
  if (clientInfo?.version) {
    attributes['mcp.client.version'] = clientInfo.version;
  }

  return attributes;
}

/**
 * Build server attributes from stored server info
 * @param transport - MCP transport instance
 * @returns Server attributes for span instrumentation
 */
export function getServerAttributes(transport: MCPTransport): Record<string, string> {
  const serverInfo = getSessionDataForTransport(transport)?.serverInfo;
  const attributes: Record<string, string> = {};

  if (serverInfo?.name) {
    attributes[MCP_SERVER_NAME_ATTRIBUTE] = serverInfo.name;
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE_ATTRIBUTE] = serverInfo.title;
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION_ATTRIBUTE] = serverInfo.version;
  }

  return attributes;
}

/**
 * Extracts client connection info from extra handler data
 * @param extra - Extra handler data containing connection info
 * @returns Client address and port information
 */
export function extractClientInfo(extra: ExtraHandlerData): {
  address?: string;
  port?: number;
} {
  return {
    address:
      extra?.requestInfo?.remoteAddress ||
      extra?.clientAddress ||
      extra?.request?.ip ||
      extra?.request?.connection?.remoteAddress,
    port: extra?.requestInfo?.remotePort || extra?.clientPort || extra?.request?.connection?.remotePort,
  };
}

/**
 * Build transport and network attributes
 * @param transport - MCP transport instance
 * @param extra - Optional extra handler data
 * @returns Transport attributes for span instrumentation
 */
export function buildTransportAttributes(
  transport: MCPTransport,
  extra?: ExtraHandlerData,
): Record<string, string | number> {
  const sessionId = transport.sessionId;
  const clientInfo = extra ? extractClientInfo(extra) : {};
  const { mcpTransport, networkTransport } = getTransportTypes(transport);
  const clientAttributes = getClientAttributes(transport);
  const serverAttributes = getServerAttributes(transport);
  const protocolVersion = getProtocolVersionForTransport(transport);

  const attributes = {
    ...(sessionId && { [MCP_SESSION_ID_ATTRIBUTE]: sessionId }),
    ...(clientInfo.address && { [CLIENT_ADDRESS_ATTRIBUTE]: clientInfo.address }),
    ...(clientInfo.port && { [CLIENT_PORT_ATTRIBUTE]: clientInfo.port }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport,
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport,
    [NETWORK_PROTOCOL_VERSION_ATTRIBUTE]: '2.0',
    ...(protocolVersion && { [MCP_PROTOCOL_VERSION_ATTRIBUTE]: protocolVersion }),
    ...clientAttributes,
    ...serverAttributes,
  };

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

/**
 * Build attributes for tool result content items
 * @param content - Array of content items from tool result
 * @returns Attributes extracted from each content item including type, text, mime type, URI, and resource info
 */
function buildAllContentItemAttributes(content: unknown[]): Record<string, string | number> {
  const attributes: Record<string, string | number> = {
    [MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE]: content.length,
  };

  for (const [i, item] of content.entries()) {
    if (typeof item !== 'object' || item === null) continue;

    const contentItem = item as Record<string, unknown>;
    const prefix = content.length === 1 ? 'mcp.tool.result' : `mcp.tool.result.${i}`;

    const safeSet = (key: string, value: unknown): void => {
      if (typeof value === 'string') attributes[`${prefix}.${key}`] = value;
    };

    safeSet('content_type', contentItem.type);
    safeSet('mime_type', contentItem.mimeType);
    safeSet('uri', contentItem.uri);
    safeSet('name', contentItem.name);

    if (typeof contentItem.text === 'string') {
      const text = contentItem.text;
      const maxLength = 500;
      attributes[`${prefix}.content`] = text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
    }

    if (typeof contentItem.data === 'string') {
      attributes[`${prefix}.data_size`] = contentItem.data.length;
    }

    const resource = contentItem.resource;
    if (typeof resource === 'object' && resource !== null) {
      const res = resource as Record<string, unknown>;
      safeSet('resource_uri', res.uri);
      safeSet('resource_mime_type', res.mimeType);
    }
  }

  return attributes;
}

/**
 * Extract tool result attributes for span instrumentation
 * @param result - Tool execution result
 * @returns Attributes extracted from tool result content
 */
export function extractToolResultAttributes(result: unknown): Record<string, string | number | boolean> {
  let attributes: Record<string, string | number | boolean> = {};
  if (typeof result !== 'object' || result === null) return attributes;

  const resultObj = result as Record<string, unknown>;
  if (typeof resultObj.isError === 'boolean') {
    attributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] = resultObj.isError;
  }
  if (Array.isArray(resultObj.content)) {
    attributes = { ...attributes, ...buildAllContentItemAttributes(resultObj.content) };
  }
  return attributes;
}

/**
 * Extract prompt result attributes for span instrumentation
 * @param result - Prompt execution result
 * @returns Attributes extracted from prompt result
 */
export function extractPromptResultAttributes(result: unknown): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};
  if (typeof result !== 'object' || result === null) return attributes;

  const resultObj = result as Record<string, unknown>;

  if (typeof resultObj.description === 'string')
    attributes[MCP_PROMPT_RESULT_DESCRIPTION_ATTRIBUTE] = resultObj.description;

  if (Array.isArray(resultObj.messages)) {
    attributes[MCP_PROMPT_RESULT_MESSAGE_COUNT_ATTRIBUTE] = resultObj.messages.length;

    // Extract attributes for each message
    const messages = resultObj.messages;
    for (const [i, message] of messages.entries()) {
      if (typeof message !== 'object' || message === null) continue;

      const messageObj = message as Record<string, unknown>;
      const prefix = messages.length === 1 ? 'mcp.prompt.result' : `mcp.prompt.result.${i}`;

      const safeSet = (key: string, value: unknown): void => {
        if (typeof value === 'string') {
          const attrName = messages.length === 1 ? `${prefix}.message_${key}` : `${prefix}.${key}`;
          attributes[attrName] = value;
        }
      };

      safeSet('role', messageObj.role);

      if (typeof messageObj.content === 'object' && messageObj.content !== null) {
        const content = messageObj.content as Record<string, unknown>;
        if (typeof content.text === 'string') {
          const attrName = messages.length === 1 ? `${prefix}.message_content` : `${prefix}.content`;
          attributes[attrName] = content.text;
        }
      }
    }
  }

  return attributes;
}
