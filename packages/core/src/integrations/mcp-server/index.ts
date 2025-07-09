import { fill } from '../../utils/object';
import type { MCPServerInstance, MCPTransport } from './types';
import { wrapTransportMethods, wrapHandlerMethods } from './wrapping';
import { validateMcpServerInstance } from './guards';

const wrappedMcpServerInstances = new WeakSet();

// Map to store which transport a given JSON-RPC request ID arrived on.
const requestTransportMap = new Map<string | number, MCPTransport>();

/**
 * Wraps a MCP Server instance from the `@modelcontextprotocol/sdk` package with Sentry instrumentation.
 *
 * Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package.
 */
export function wrapMcpServerWithSentry<S extends object>(mcpServerInstance: S): S {
  if (wrappedMcpServerInstances.has(mcpServerInstance)) {
    return mcpServerInstance;
  }

  if (!validateMcpServerInstance(mcpServerInstance)) {
    return mcpServerInstance;
  }

  const serverInstance = mcpServerInstance as MCPServerInstance;

  // Wrap tool, resource, and prompt methods to ensure proper async context
  wrapHandlerMethods(serverInstance, requestTransportMap);

  // Wrap connect to handle transport-level notification instrumentation and inject transport info
  fill(serverInstance, 'connect', (originalConnect) => {
    return async function(this: MCPServerInstance, transport: MCPTransport, ...restArgs: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const result = await originalConnect.call(this, transport, ...restArgs);
      
      // Wrap transport methods
      wrapTransportMethods(transport, requestTransportMap);
      
      return result;
    };
  });

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance as S;
}


