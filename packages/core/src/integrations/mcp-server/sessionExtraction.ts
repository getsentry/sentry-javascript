/**
 * Session and party info extraction functions for MCP server instrumentation
 *
 * Handles extraction of client/server info and session data from MCP messages.
 */

import {
  CLIENT_ADDRESS_ATTRIBUTE,
  CLIENT_PORT_ATTRIBUTE,
  MCP_CLIENT_CAPABILITIES_ATTRIBUTE,
  MCP_CLIENT_EXTENSION_IDS_ATTRIBUTE,
  MCP_CLIENT_NAME_ATTRIBUTE,
  MCP_CLIENT_TITLE_ATTRIBUTE,
  MCP_CLIENT_VERSION_ATTRIBUTE,
  MCP_PROTOCOL_VERSION_ATTRIBUTE,
  MCP_SERVER_NAME_ATTRIBUTE,
  MCP_SERVER_TITLE_ATTRIBUTE,
  MCP_SERVER_VERSION_ATTRIBUTE,
  MCP_SESSION_ID_ATTRIBUTE,
  MCP_TRANSPORT_ATTRIBUTE,
  NETWORK_PROTOCOL_NAME_ATTRIBUTE,
  NETWORK_TRANSPORT_ATTRIBUTE,
} from './attributes';
import { getProtocolVersionForTransport, getSessionDataForTransport } from './sessionManagement';
import { getBoundedMcpString, getBoundedMcpStringList } from './serialization';
import type { ExtraHandlerData, JsonRpcRequest, McpAttributes, MCPTransport, PartyInfo, SessionData } from './types';
import { isValidContentItem } from './validation';

const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const MCP_CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';
const MCP_CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
const MCP_SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';

const STATELESS_MCP_PROTOCOL_VERSION = '2026-07-28';
const MAX_MCP_PROTOCOL_VERSION_LENGTH = 64;

function isStatelessMcpProtocolVersion(protocolVersion?: string): boolean {
  return (
    typeof protocolVersion === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(protocolVersion) &&
    protocolVersion >= STATELESS_MCP_PROTOCOL_VERSION
  );
}

/**
 * Extracts and validates PartyInfo from an unknown object
 * @param obj - Unknown object that might contain party info
 * @returns Validated PartyInfo object with only string properties
 */
function extractPartyInfo(obj: unknown): PartyInfo {
  const partyInfo: PartyInfo = {};

  if (isValidContentItem(obj)) {
    if (typeof obj.name === 'string') {
      partyInfo.name = getBoundedMcpString(obj.name);
    }
    if (typeof obj.title === 'string') {
      partyInfo.title = getBoundedMcpString(obj.title);
    }
    if (typeof obj.version === 'string') {
      partyInfo.version = getBoundedMcpString(obj.version);
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
      sessionData.protocolVersion = getBoundedMcpString(
        request.params.protocolVersion,
        MAX_MCP_PROTOCOL_VERSION_LENGTH,
      );
    }
    if (request.params.clientInfo) {
      sessionData.clientInfo = extractPartyInfo(request.params.clientInfo);
    }
  }

  return sessionData;
}

/**
 * Extracts per-request data from an MCP 2026-07-28 request envelope.
 * @param message - JSON-RPC request containing modern request metadata
 * @returns Session data extracted from the message
 */
export function extractSessionDataFromMessage(message: JsonRpcRequest): SessionData {
  const sessionData: SessionData = {};
  if (isValidContentItem(message.params)) {
    if (isValidContentItem(message.params._meta)) {
      const meta = message.params._meta;
      if (typeof meta[MCP_PROTOCOL_VERSION_META_KEY] === 'string') {
        sessionData.protocolVersion = getBoundedMcpString(
          meta[MCP_PROTOCOL_VERSION_META_KEY],
          MAX_MCP_PROTOCOL_VERSION_LENGTH,
        );
      }
      if (meta[MCP_CLIENT_INFO_META_KEY]) {
        sessionData.clientInfo = extractPartyInfo(meta[MCP_CLIENT_INFO_META_KEY]);
      }
      if (isValidContentItem(meta[MCP_CLIENT_CAPABILITIES_META_KEY])) {
        const capabilities = meta[MCP_CLIENT_CAPABILITIES_META_KEY];
        sessionData.clientCapabilities = getBoundedMcpStringList(
          Object.keys(capabilities)
            .filter(capability => capability !== 'experimental' && capability !== 'extensions')
            .sort(),
        );
        if (isValidContentItem(capabilities.extensions)) {
          sessionData.clientExtensionIds = getBoundedMcpStringList(Object.keys(capabilities.extensions).sort());
        }
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
      sessionData.protocolVersion = getBoundedMcpString(result.protocolVersion, MAX_MCP_PROTOCOL_VERSION_LENGTH);
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
export function getClientAttributes(transport: MCPTransport): McpAttributes {
  const sessionData = getSessionDataForTransport(transport);
  return buildClientAttributes(sessionData);
}

/** Build bounded client identity and capability attributes for one MCP operation. */
export function buildClientAttributes(sessionData?: SessionData): McpAttributes {
  const clientInfo = sessionData?.clientInfo;
  const attributes: McpAttributes = {};

  if (clientInfo?.name) {
    attributes[MCP_CLIENT_NAME_ATTRIBUTE] = getBoundedMcpString(clientInfo.name);
  }
  if (clientInfo?.title) {
    attributes[MCP_CLIENT_TITLE_ATTRIBUTE] = getBoundedMcpString(clientInfo.title);
  }
  if (clientInfo?.version) {
    attributes[MCP_CLIENT_VERSION_ATTRIBUTE] = getBoundedMcpString(clientInfo.version);
  }
  if (sessionData?.clientCapabilities?.length) {
    attributes[MCP_CLIENT_CAPABILITIES_ATTRIBUTE] = getBoundedMcpStringList(sessionData.clientCapabilities);
  }
  if (sessionData?.clientExtensionIds?.length) {
    attributes[MCP_CLIENT_EXTENSION_IDS_ATTRIBUTE] = getBoundedMcpStringList(sessionData.clientExtensionIds);
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
    attributes[MCP_CLIENT_NAME_ATTRIBUTE] = getBoundedMcpString(clientInfo.name);
  }
  if (clientInfo?.title) {
    attributes[MCP_CLIENT_TITLE_ATTRIBUTE] = getBoundedMcpString(clientInfo.title);
  }
  if (clientInfo?.version) {
    attributes[MCP_CLIENT_VERSION_ATTRIBUTE] = getBoundedMcpString(clientInfo.version);
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
    attributes[MCP_SERVER_NAME_ATTRIBUTE] = getBoundedMcpString(serverInfo.name);
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE_ATTRIBUTE] = getBoundedMcpString(serverInfo.title);
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION_ATTRIBUTE] = getBoundedMcpString(serverInfo.version);
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
    attributes[MCP_SERVER_NAME_ATTRIBUTE] = getBoundedMcpString(serverInfo.name);
  }
  if (serverInfo?.title) {
    attributes[MCP_SERVER_TITLE_ATTRIBUTE] = getBoundedMcpString(serverInfo.title);
  }
  if (serverInfo?.version) {
    attributes[MCP_SERVER_VERSION_ATTRIBUTE] = getBoundedMcpString(serverInfo.version);
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
 * Extracts transport types based on transport constructor name
 * @param transport - MCP transport instance
 * @returns Transport type mapping for span attributes
 */
export function getTransportTypes(transport: MCPTransport): {
  mcpTransport: string;
  networkTransport: string;
  networkProtocolName?: string;
} {
  if (!transport?.constructor) {
    return { mcpTransport: 'unknown', networkTransport: 'unknown' };
  }
  const transportName = typeof transport.constructor?.name === 'string' ? transport.constructor.name : 'unknown';
  let networkTransport = 'unknown';
  let networkProtocolName: string | undefined;

  const lowerTransportName = transportName.toLowerCase();
  if (lowerTransportName.includes('stdio')) {
    networkTransport = 'pipe';
  } else if (lowerTransportName.includes('websocket')) {
    networkTransport = 'tcp';
    networkProtocolName = 'websocket';
  } else if (lowerTransportName.includes('http') || lowerTransportName.includes('sse')) {
    networkTransport = 'tcp';
    networkProtocolName = 'http';
  }

  return {
    mcpTransport: transportName,
    networkTransport,
    networkProtocolName,
  };
}

/**
 * Build transport and network attributes
 * @param transport - MCP transport instance
 * @param extra - Optional extra handler data
 * @returns Transport attributes for span instrumentation
 * @note sessionId may be undefined during initial setup - session should be established by client during initialize flow
 */
export function buildTransportAttributes(
  transport: MCPTransport,
  extra?: ExtraHandlerData,
  operationSessionData?: SessionData,
): McpAttributes {
  const sessionId = transport && 'sessionId' in transport ? transport.sessionId : undefined;
  const clientInfo = extra ? extractClientInfo(extra) : {};
  const { mcpTransport, networkTransport, networkProtocolName } = getTransportTypes(transport);
  const clientAttributes = operationSessionData
    ? buildClientAttributes(operationSessionData)
    : getClientAttributes(transport);
  const serverAttributes = getServerAttributes(transport);
  const protocolVersion = getProtocolVersionForTransport(transport);
  const operationProtocolVersion = operationSessionData?.protocolVersion || protocolVersion;

  const attributes = {
    ...(sessionId && !isStatelessMcpProtocolVersion(operationProtocolVersion)
      ? { [MCP_SESSION_ID_ATTRIBUTE]: getBoundedMcpString(sessionId) }
      : {}),
    ...(clientInfo.address && { [CLIENT_ADDRESS_ATTRIBUTE]: clientInfo.address }),
    ...(clientInfo.port && { [CLIENT_PORT_ATTRIBUTE]: clientInfo.port }),
    [MCP_TRANSPORT_ATTRIBUTE]: mcpTransport,
    [NETWORK_TRANSPORT_ATTRIBUTE]: networkTransport,
    ...(networkProtocolName && { [NETWORK_PROTOCOL_NAME_ATTRIBUTE]: networkProtocolName }),
    ...(operationProtocolVersion && {
      [MCP_PROTOCOL_VERSION_ATTRIBUTE]: getBoundedMcpString(operationProtocolVersion, MAX_MCP_PROTOCOL_VERSION_LENGTH),
    }),
    ...clientAttributes,
    ...serverAttributes,
  };

  return attributes;
}
