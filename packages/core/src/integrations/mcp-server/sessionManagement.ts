/**
 * Session data management for MCP server instrumentation
 *
 * Session data is scoped to the transport captured by the instrumentation wrapper. Session ids
 * are peer-controlled and can be reused by independent transports.
 */

import type { MCPTransport, PartyInfo, SessionData } from './types';

const transportToSessionData = new WeakMap<MCPTransport, SessionData>();

/**
 * Gets session data for a transport identity.
 * @internal
 */
function getSessionData(transport: MCPTransport): SessionData | undefined {
  return transportToSessionData.get(transport);
}

/**
 * Sets session data for a transport identity.
 * @internal
 */
function setSessionData(transport: MCPTransport, data: SessionData): void {
  transportToSessionData.set(transport, data);
}

/**
 * Stores session data for a transport
 * @param transport - MCP transport instance
 * @param sessionData - Session data to store
 */
export function storeSessionDataForTransport(transport: MCPTransport, sessionData: SessionData): void {
  setSessionData(transport, sessionData);
}

/**
 * Updates session data for a transport (merges with existing data)
 * @param transport - MCP transport instance
 * @param partialSessionData - Partial session data to merge with existing data
 */
export function updateSessionDataForTransport(transport: MCPTransport, partialSessionData: Partial<SessionData>): void {
  const existingData = getSessionData(transport) || {};
  setSessionData(transport, { ...existingData, ...partialSessionData });
}

/**
 * Retrieves client information for a transport
 * @param transport - MCP transport instance
 * @returns Client information if available
 */
export function getClientInfoForTransport(transport: MCPTransport): PartyInfo | undefined {
  return getSessionData(transport)?.clientInfo;
}

/**
 * Retrieves protocol version for a transport
 * @param transport - MCP transport instance
 * @returns Protocol version if available
 */
export function getProtocolVersionForTransport(transport: MCPTransport): string | undefined {
  return getSessionData(transport)?.protocolVersion;
}

/**
 * Retrieves full session data for a transport
 * @param transport - MCP transport instance
 * @returns Complete session data if available
 */
export function getSessionDataForTransport(transport: MCPTransport): SessionData | undefined {
  return getSessionData(transport);
}

/**
 * Cleans up session data for a specific transport (when that transport closes)
 * @param transport - MCP transport instance
 */
export function cleanupSessionDataForTransport(transport: MCPTransport): void {
  transportToSessionData.delete(transport);
}
