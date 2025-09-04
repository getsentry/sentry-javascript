/**
 * Session data management for MCP server instrumentation
 */

import type { MCPTransport, PartyInfo, SessionData } from './types';

/**
 * Transport-scoped session data storage (only for transports with sessionId)
 * @internal Maps transport instances to session-level data
 */
const transportToSessionData = new WeakMap<MCPTransport, SessionData>();

/**
 * Stores session data for a transport with sessionId
 * @param transport - MCP transport instance
 * @param sessionData - Session data to store
 */
export function storeSessionDataForTransport(transport: MCPTransport, sessionData: SessionData): void {
  if (transport.sessionId) {
    transportToSessionData.set(transport, sessionData);
  }
}

/**
 * Updates session data for a transport with sessionId (merges with existing data)
 * @param transport - MCP transport instance
 * @param partialSessionData - Partial session data to merge with existing data
 */
export function updateSessionDataForTransport(transport: MCPTransport, partialSessionData: Partial<SessionData>): void {
  if (transport.sessionId) {
    const existingData = transportToSessionData.get(transport) || {};
    transportToSessionData.set(transport, { ...existingData, ...partialSessionData });
  }
}

/**
 * Retrieves client information for a transport
 * @param transport - MCP transport instance
 * @returns Client information if available
 */
export function getClientInfoForTransport(transport: MCPTransport): PartyInfo | undefined {
  return transportToSessionData.get(transport)?.clientInfo;
}

/**
 * Retrieves protocol version for a transport
 * @param transport - MCP transport instance
 * @returns Protocol version if available
 */
export function getProtocolVersionForTransport(transport: MCPTransport): string | undefined {
  return transportToSessionData.get(transport)?.protocolVersion;
}

/**
 * Retrieves full session data for a transport
 * @param transport - MCP transport instance
 * @returns Complete session data if available
 */
export function getSessionDataForTransport(transport: MCPTransport): SessionData | undefined {
  return transportToSessionData.get(transport);
}

/**
 * Cleans up session data for a specific transport (when that transport closes)
 * @param transport - MCP transport instance
 */
export function cleanupSessionDataForTransport(transport: MCPTransport): void {
  transportToSessionData.delete(transport);
}
