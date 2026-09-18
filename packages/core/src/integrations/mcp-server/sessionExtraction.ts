/**
 * Session and party info extraction functions for MCP server instrumentation
 *
 * Handles extraction of client/server info and session data from MCP messages.
 */

import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  MCP_CLIENT_NAME,
  MCP_CLIENT_TITLE,
  MCP_CLIENT_VERSION,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  MCP_SESSION_ID,
  MCP_TRANSPORT,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  NETWORK_TRANSPORT,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import {
  getClientInfoForTransport,
  getProtocolVersionForTransport,
  getSessionDataForTransport,
} from './sessionManagement';
import type {
  ExtraHandlerData,
  JsonRpcNotification,
  JsonRpcRequest,
  MCPTransport,
  PartyInfo,
  SessionData,
} from './types';
import { isValidContentItem } from './validation';

const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const MCP_CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';
const MCP_SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';

/**
 * Extracts and validates PartyInfo from an unknown object
 * @param obj - Unknown object that might contain party info
 * @returns Validated PartyInfo object with only string properties
 */
function extractPartyInfo(obj: unknown): PartyInfo {
  const partyInfo: PartyInfo = {};

  if (isValidContentItem(obj)) {
    if (typeof obj.name === 'string') {
      partyInfo.name = obj.name;
    }
    if (typeof obj.title === 'string') {
      partyInfo.title = obj.title;
    }
    if (typeof obj.version === 'string') {
      partyInfo.version = obj.version;
    }
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
  if (isValidContentItem(request.params)) {
    if (typeof request.params.protocolVersion === 'string') {
      sessionData.protocolVersion = request.params.protocolVersion;
    }
    if (request.params.clientInfo) {
      sessionData.clientInfo = extractPartyInfo(request.params.clientInfo);
    }
  }

  return sessionData;
}

/**
 * Extracts session data from an MCP 2026-07-28 request or notification envelope.
 * @param message - JSON-RPC message containing modern request metadata
 * @returns Session data extracted from the message
 */
export function extractSessionDataFromMessage(message: JsonRpcRequest | JsonRpcNotification): SessionData {
  const sessionData: SessionData = {};
  if (isValidContentItem(message.params)) {
    if (isValidContentItem(message.params._meta)) {
      const meta = message.params._meta;
      if (typeof meta[MCP_PROTOCOL_VERSION_META_KEY] === 'string') {
        sessionData.protocolVersion = meta[MCP_PROTOCOL_VERSION_META_KEY];
      }
      if (meta[MCP_CLIENT_INFO_META_KEY]) {
        sessionData.clientInfo = extractPartyInfo(meta[MCP_CLIENT_INFO_META_KEY]);
      }
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
  if (isValidContentItem(result)) {
    if (typeof result.protocolVersion === 'string') {
      sessionData.protocolVersion = result.protocolVersion;
    }
    if (result.serverInfo) {
      sessionData.serverInfo = extractPartyInfo(result.serverInfo);
    }
  }

  return sessionData;
}

/**
 * Extracts session data from MCP 2026-07-28 result metadata.
 * @param result - JSON-RPC result containing modern response metadata
 * @returns Session data extracted from the result
 */
export function extractSessionDataFromResponse(result: unknown): Partial<SessionData> {
  const sessionData: Partial<SessionData> = {};
  if (isValidContentItem(result)) {
    if (isValidContentItem(result._meta) && result._meta[MCP_SERVER_INFO_META_KEY]) {
      sessionData.serverInfo = extractPartyInfo(result._meta[MCP_SERVER_INFO_META_KEY]);
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
    attributes[MCP_CLIENT_NAME] = clientInfo.name;
  }
  if (clientInfo?.title) {
    attributes[MCP_CLIENT_TITLE] = clientInfo.title;
  }
  if (clientInfo?.version) {
    attributes[MCP_CLIENT_VERSION] = clientInfo.version;
  }

  return attributes;
}

/**
 * Build client attributes from PartyInfo directly
 * @param clientInfo - Client party info
 * @returns Client attributes for span instrumentation
 */
export function buildClientAttributesFromInfo(clientInfo?: PartyInfo): Record<string, string> {
  const attributes: Record<string, string> = {};

  if (clientInfo?.name) {
    attributes[MCP_CLIENT_NAME] = clientInfo.name;
  }
  if (clientInfo?.title) {
    attributes[MCP_CLIENT_TITLE] = clientInfo.title;
  }
  if (clientInfo?.version) {
    attributes[MCP_CLIENT_VERSION] = clientInfo.version;
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
    attributes[MCP_SERVER_NAME] = serverInfo.name;
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE] = serverInfo.title;
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION] = serverInfo.version;
  }

  return attributes;
}

/**
 * Build server attributes from PartyInfo directly
 * @param serverInfo - Server party info
 * @returns Server attributes for span instrumentation
 */
export function buildServerAttributesFromInfo(serverInfo?: PartyInfo): Record<string, string> {
  const attributes: Record<string, string> = {};

  if (serverInfo?.name) {
    attributes[MCP_SERVER_NAME] = serverInfo.name;
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE] = serverInfo.title;
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION] = serverInfo.version;
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
 * Identifies known transport implementations without guessing from custom class names.
 * @param transport - MCP transport instance
 * @returns Transport type mapping for span attributes
 */
export function getTransportTypes(transport: MCPTransport): {
  mcpTransport: string;
  networkTransport?: string;
  networkProtocolName?: string;
} {
  const transportName = typeof transport?.constructor?.name === 'string' ? transport.constructor.name : 'unknown';
  const isHttp = [
    'StreamableHTTPServerTransport',
    'NodeStreamableHTTPServerTransport',
    'WebStandardStreamableHTTPServerTransport',
    'SSEServerTransport',
  ].includes(transportName);

  return {
    mcpTransport: transportName,
    networkTransport: transportName === 'StdioServerTransport' ? 'pipe' : undefined,
    networkProtocolName: isHttp ? 'http' : undefined,
  };
}

/**
 * Extracts HTTP metadata available on the current MCP request.
 * @param extra - Request metadata provided by the MCP transport
 * @see https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md#recording-mcp-transport
 */
function getHttpAttributes(extra?: ExtraHandlerData): Record<string, string> {
  const headers = extra?.request?.headers ?? extra?.requestInfo?.headers;
  const userAgent =
    typeof headers?.get === 'function'
      ? headers.get('user-agent')
      : headers && 'user-agent' in headers
        ? headers['user-agent']
        : undefined;
  const httpProtocol = extra?.request?.cf?.httpProtocol;
  const httpVersion = typeof httpProtocol === 'string' ? /^HTTP\/([\d.]+)$/i.exec(httpProtocol)?.[1] : undefined;
  const networkTransport =
    httpVersion === '3' ? 'quic' : httpVersion && ['1.0', '1.1', '2'].includes(httpVersion) ? 'tcp' : undefined;

  return {
    ...((headers || httpVersion) && { [NETWORK_PROTOCOL_NAME]: 'http' }),
    ...(httpVersion && { [NETWORK_PROTOCOL_VERSION]: httpVersion }),
    ...(networkTransport && { [NETWORK_TRANSPORT]: networkTransport }),
    ...(typeof userAgent === 'string' && userAgent && { [USER_AGENT_ORIGINAL]: userAgent }),
    ...(Array.isArray(userAgent) && { [USER_AGENT_ORIGINAL]: userAgent.join(', ') }),
  };
}

/**
 * Build transport and network attributes
 * @param transport - MCP transport instance
 * @param extra - Optional extra handler data
 * @param message - Current message carrying request-scoped protocol metadata
 * @returns Transport attributes for span instrumentation
 * @note sessionId may be undefined during initial setup - session should be established by client during initialize flow
 */
export function buildTransportAttributes(
  transport: MCPTransport,
  extra?: ExtraHandlerData,
  message?: JsonRpcRequest | JsonRpcNotification,
): Record<string, string | number> {
  const messageData = message && extractSessionDataFromMessage(message);
  const hasRequestMetadata = messageData?.protocolVersion !== undefined || messageData?.clientInfo !== undefined;
  const sessionId = !hasRequestMetadata && transport && 'sessionId' in transport ? transport.sessionId : undefined;
  const clientInfo = extra ? extractClientInfo(extra) : {};
  const { mcpTransport, networkTransport, networkProtocolName } = getTransportTypes(transport);
  const clientAttributes = hasRequestMetadata
    ? buildClientAttributesFromInfo(messageData?.clientInfo)
    : getClientAttributes(transport);
  const serverAttributes = hasRequestMetadata ? {} : getServerAttributes(transport);
  const protocolVersion = hasRequestMetadata ? messageData?.protocolVersion : getProtocolVersionForTransport(transport);

  const attributes = {
    ...(sessionId && { [MCP_SESSION_ID]: sessionId }),
    ...(clientInfo.address && { [CLIENT_ADDRESS]: clientInfo.address }),
    ...(clientInfo.port && { [CLIENT_PORT]: clientInfo.port }),
    // oxlint-disable-next-line typescript/no-deprecated -- Keep the transport implementation name distinct from the network transport.
    [MCP_TRANSPORT]: mcpTransport,
    ...(networkTransport && { [NETWORK_TRANSPORT]: networkTransport }),
    ...(networkProtocolName && { [NETWORK_PROTOCOL_NAME]: networkProtocolName }),
    ...getHttpAttributes(extra),
    ...(protocolVersion && { [MCP_PROTOCOL_VERSION]: protocolVersion }),
    ...clientAttributes,
    ...serverAttributes,
  };

  return attributes;
}
