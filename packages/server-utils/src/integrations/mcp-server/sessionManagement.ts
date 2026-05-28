/**
 * Session data management for MCP server instrumentation
 *
 * Uses sessionId as the primary key for stateful transports. This handles the wrapper
 * transport pattern (e.g., NodeStreamableHTTPServerTransport wrapping WebStandardStreamableHTTPServerTransport)
 * where different methods may receive different `this` values but share the same sessionId.
 *
 * Falls back to WeakMap by transport instance for stateless transports (no sessionId).
 */

import type { MCPTransport, PartyInfo, SessionData } from './types';

/**
 * Session-scoped data storage for stateful transports (with sessionId)
 * @internal Using sessionId as key handles wrapper transport patterns
 */
const sessionToSessionData = new Map<string, SessionData>();

/**
 * Transport-scoped data storage fallback for stateless transports (no sessionId)
 * @internal WeakMap allows automatic cleanup when transport is garbage collected
 */
const statelessSessionData = new WeakMap<MCPTransport, SessionData>();

/**
 * Gets session data for a transport, checking sessionId first then fallback
 * @internal
 */
function getSessionData(transport: MCPTransport): SessionData | undefined {
  const sessionId = transport.sessionId;
  if (sessionId) {
    return sessionToSessionData.get(sessionId);
  }
  return statelessSessionData.get(transport);
}

/**
 * Sets session data for a transport, using sessionId when available
 * @internal
 */
function setSessionData(transport: MCPTransport, data: SessionData): void {
  const sessionId = transport.sessionId;
  if (sessionId) {
    sessionToSessionData.set(sessionId, data);
  } else {
    statelessSessionData.set(transport, data);
  }
}

/**
 * Stores session data for a transport
 * @param transport - MCP transport instance
 * @param sessionData - Session data to store
 */
export function storeSessionDataForTransport(transport: MCPTransport, sessionData: SessionData): void {
  // For stateful transports, always store (sessionId is the key)
  // For stateless transports, also store (transport instance is the key)
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
  const sessionId = transport.sessionId;
  if (sessionId) {
    sessionToSessionData.delete(sessionId);
  }
  // Note: WeakMap entries are automatically cleaned up when transport is GC'd
  // No explicit delete needed for statelessSessionData
}
