/**
 * Attribute extraction and building functions for MCP server instrumentation
 */

import { isURLObjectRelative, parseStringToURLObject } from '../../utils/url';
import {
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_PROMPT_NAME_ATTRIBUTE,
  MCP_REQUEST_ID_ATTRIBUTE,
  MCP_RESOURCE_URI_ATTRIBUTE,
  MCP_SESSION_ID_ATTRIBUTE,
  MCP_TOOL_NAME_ATTRIBUTE,
  MCP_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_VERSION_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
} from './attributes';
import type {
  ExtraHandlerData,
  JsonRpcNotification,
  JsonRpcRequest,
  McpSpanType,
  MCPTransport,
  MethodConfig,
} from './types';

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
export function extractTargetInfo(
  method: string,
  params: Record<string, unknown>,
): {
  target?: string;
  attributes: Record<string, string>;
} {
  const config = METHOD_CONFIGS[method as keyof typeof METHOD_CONFIGS];
  if (!config) {
    return { attributes: {} };
  }

  const target =
    config.targetField && typeof params?.[config.targetField] === 'string'
      ? (params[config.targetField] as string)
      : undefined;

  return {
    target,
    attributes: target && config.targetAttribute ? { [config.targetAttribute]: target } : {},
  };
}

/** Extracts request arguments based on method type */
export function getRequestArguments(method: string, params: Record<string, unknown>): Record<string, string> {
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
export function getTransportTypes(transport: MCPTransport): { mcpTransport: string; networkTransport: string } {
  const transportName = transport.constructor?.name?.toLowerCase() || '';

  // Standard MCP transports per specification
  if (transportName.includes('stdio')) {
    return { mcpTransport: 'stdio', networkTransport: 'pipe' };
  }

  // Streamable HTTP is the standard HTTP-based transport
  if (transportName.includes('streamablehttp') || transportName.includes('streamable')) {
    return { mcpTransport: 'http', networkTransport: 'tcp' };
  }

  // SSE is deprecated (backwards compatibility)
  if (transportName.includes('sse')) {
    return { mcpTransport: 'sse', networkTransport: 'tcp' };
  }

  // For custom transports, mark as unknown
  return { mcpTransport: 'unknown', networkTransport: 'unknown' };
}

/** Extracts additional attributes for specific notification types */
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

/** Extracts client connection info from extra handler data */
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

/** Build transport and network attributes */
export function buildTransportAttributes(
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

/** Build type-specific attributes based on message type */
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

  // For notifications, only include notification-specific attributes
  return getNotificationAttributes(message.method, params || {});
}

/** Get metadata about tool result content array */
function getContentMetadata(content: unknown[]): Record<string, string | number> {
  return {
    'mcp.tool.result.content_count': content.length,
  };
}

/** Build attributes from a single content item */
function buildContentItemAttributes(
  contentItem: Record<string, unknown>,
  prefix: string,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  if (typeof contentItem.type === 'string') {
    attributes[`${prefix}.content_type`] = contentItem.type;
  }

  if (typeof contentItem.text === 'string') {
    const text = contentItem.text;
    attributes[`${prefix}.content`] = text.length > 500 ? `${text.substring(0, 497)}...` : text;
  }

  if (typeof contentItem.mimeType === 'string') {
    attributes[`${prefix}.mime_type`] = contentItem.mimeType;
  }

  if (typeof contentItem.uri === 'string') {
    attributes[`${prefix}.uri`] = contentItem.uri;
  }

  if (typeof contentItem.name === 'string') {
    attributes[`${prefix}.name`] = contentItem.name;
  }

  if (typeof contentItem.data === 'string') {
    attributes[`${prefix}.data_size`] = contentItem.data.length;
  }

  return attributes;
}

/** Build attributes from embedded resource object */
function buildEmbeddedResourceAttributes(resource: Record<string, unknown>, prefix: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  if (typeof resource.uri === 'string') {
    attributes[`${prefix}.resource_uri`] = resource.uri;
  }

  if (typeof resource.mimeType === 'string') {
    attributes[`${prefix}.resource_mime_type`] = resource.mimeType;
  }

  return attributes;
}

/** Build attributes for all content items in the result */
function buildAllContentItemAttributes(content: unknown[]): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    if (item && typeof item === 'object' && item !== null) {
      const contentItem = item as Record<string, unknown>;
      const prefix = content.length === 1 ? 'mcp.tool.result' : `mcp.tool.result.${i}`;

      Object.assign(attributes, buildContentItemAttributes(contentItem, prefix));

      if (contentItem.resource && typeof contentItem.resource === 'object') {
        const resourceAttrs = buildEmbeddedResourceAttributes(contentItem.resource as Record<string, unknown>, prefix);
        Object.assign(attributes, resourceAttrs);
      }
    }
  }

  return attributes;
}

/** Extract tool result attributes for span instrumentation */
export function extractToolResultAttributes(result: unknown): Record<string, string | number | boolean> {
  let attributes: Record<string, string | number | boolean> = {};

  if (typeof result !== 'object' || result === null) {
    return attributes;
  }

  const resultObj = result as Record<string, unknown>;

  if (typeof resultObj.isError === 'boolean') {
    attributes['mcp.tool.result.is_error'] = resultObj.isError;
  }

  if (Array.isArray(resultObj.content)) {
    attributes = {
      ...attributes,
      ...getContentMetadata(resultObj.content),
      ...buildAllContentItemAttributes(resultObj.content),
    };
  }

  return attributes;
}