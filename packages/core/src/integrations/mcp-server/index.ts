import { fill } from '../../utils/object';
import { wrapAllMCPHandlers } from './handlers';
import { wrapTransportError, wrapTransportOnClose, wrapTransportOnMessage, wrapTransportSend } from './transport';
import type { MCPServerInstance, MCPTransport } from './types';
import { validateMcpServerInstance } from './validation';

/**
 * Tracks wrapped MCP server instances to prevent double-wrapping
 * @internal
 */
const wrappedMcpServerInstances = new WeakSet();

/**
 * Wraps a MCP Server instance from the `@modelcontextprotocol/sdk` package with Sentry instrumentation.
 *
 * Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package.
 * Automatically instruments transport methods and handler functions for comprehensive monitoring.
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/core';
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
 *
 * const server = Sentry.wrapMcpServerWithSentry(
 *   new McpServer({ name: "my-server", version: "1.0.0" })
 * );
 *
 * const transport = new StreamableHTTPServerTransport();
 * await server.connect(transport);
 * ```
 *
 * @param mcpServerInstance - MCP server instance to instrument
 * @returns Instrumented server instance (same reference)
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

      wrapTransportOnMessage(transport);
      wrapTransportSend(transport);
      wrapTransportOnClose(transport);
      wrapTransportError(transport);

      return result;
    };
  });

  wrapAllMCPHandlers(serverInstance);

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance;
}
