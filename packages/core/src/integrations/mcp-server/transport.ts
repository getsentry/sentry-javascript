import { MCP_TRANSPORT_ATTRIBUTE, NETWORK_TRANSPORT_ATTRIBUTE } from './attributes';
import type { MCPTransport, TransportInfo } from './types';


/**
 * Classify an MCPTransport into OTEL semantic conventions values.
 * https://github.com/open-telemetry/semantic-conventions/blob/3097fb0af5b9492b0e3f55dc5f6c21a3dc2be8df/docs/gen-ai/mcp.md
 * 
 * @param transport - The MCP transport to classify.
 * @returns The transport info.
 */
export function classifyTransport(transport: MCPTransport): TransportInfo {
  const name = transport.constructor?.name?.toLowerCase() ?? '';

  if (name.includes('stdio')) {
    return { mcpTransport: 'stdio', networkTransport: 'pipe' };
  }
  if (name.includes('streamablehttp') || name.includes('streamable')) {
    return { mcpTransport: 'http', networkTransport: 'tcp' };
  }
  if (name.includes('sse')) {
    return { mcpTransport: 'sse', networkTransport: 'tcp' };
  }
  return { mcpTransport: 'unknown', networkTransport: 'unknown' };
}

/**
 * Convenience for building attribute object directly.
 */
export function buildTransportAttrs(info: TransportInfo): Record<string, string> {
  return {
    [MCP_TRANSPORT_ATTRIBUTE]: info.mcpTransport,
    [NETWORK_TRANSPORT_ATTRIBUTE]: info.networkTransport,
  };
}

/**
 * Gets transport attributes from the injected transport object
 */
export function getTransportAttributesFromExtra(extra?: { _mcpTransport?: MCPTransport }): Record<string, string> {
  if (!extra?._mcpTransport) {
    return {
      [MCP_TRANSPORT_ATTRIBUTE]: 'unknown',
      [NETWORK_TRANSPORT_ATTRIBUTE]: 'unknown',
    };
  }

  const info = classifyTransport(extra._mcpTransport);
  return buildTransportAttrs(info);
} 