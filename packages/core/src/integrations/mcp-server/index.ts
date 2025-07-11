import { fill } from '../../utils/object';
import { wrapAllMCPHandlers } from './handlers';
import { wrapTransportError, wrapTransportOnClose, wrapTransportOnMessage, wrapTransportSend } from './transport';
import type { MCPServerInstance, MCPTransport } from './types';
import { validateMcpServerInstance } from './validation';

const wrappedMcpServerInstances = new WeakSet();

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

  fill(serverInstance, 'connect', originalConnect => {
    return async function (this: MCPServerInstance, transport: MCPTransport, ...restArgs: unknown[]) {
      const result = await (originalConnect as (...args: unknown[]) => Promise<unknown>).call(
        this,
        transport,
        ...restArgs,
      );

      // Wrap transport methods
      wrapTransportOnMessage(transport);
      wrapTransportSend(transport);
      wrapTransportOnClose(transport);
      wrapTransportError(transport);

      return result;
    };
  });

  // Wrap server handler methods
  wrapAllMCPHandlers(serverInstance);

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance as S;
}
