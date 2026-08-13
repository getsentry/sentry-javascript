import { getClient } from '../../currentScopes';
import { isThenable } from '../../utils/is';
import { fill } from '../../utils/object';
import { captureError } from './errorCapture';
import { wrapAllMCPHandlers, wrapExistingHandlers } from './handlers';
import { wrapTransportError, wrapTransportOnClose, wrapTransportOnMessage, wrapTransportSend } from './transport';
import type { MCPServerInstance, McpServerWrapperOptions, MCPTransport, ResolvedMcpOptions } from './types';
import { validateMcpServerInstance } from './validation';

/**
 * Tracks wrapped MCP server instances to prevent double-wrapping
 * @internal
 */
const wrappedMcpServerInstances = new WeakSet();

/**
 * Wraps an MCP Server instance with Sentry instrumentation.
 *
 * Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package (legacy `tool`/`resource`/`prompt` API)
 * and `@modelcontextprotocol/server` version 2.x (`registerTool`/`registerResource`/`registerPrompt` API).
 * Automatically instruments transport methods and handler functions for comprehensive monitoring.
 *
 * Both call orderings are supported: wrapping before or after registering tools, resources,
 * and prompts. Sentry patches the registration methods for future handlers and retroactively
 * wraps any already-registered ones. Wrapping at construction time is recommended by
 * convention (consistent with other SDK integrations), but is not required.
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/core';
 * import { McpServer } from '@modelcontextprotocol/server';
 * import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
 *
 * // Wrap first, then register tools — this is the correct order
 * const server = Sentry.wrapMcpServerWithSentry(
 *   new McpServer({ name: "my-server", version: "1.0.0" })
 * );
 *
 * server.registerTool('my-tool', schema, handler);
 *
 * // Explicitly control input/output capture
 * const serverWithCustomCapture = Sentry.wrapMcpServerWithSentry(
 *   new McpServer({ name: "my-server", version: "1.0.0" }),
 *   { recordInputs: true, recordOutputs: false }
 * );
 *
 * const transport = new NodeStreamableHTTPServerTransport();
 * await server.connect(transport);
 * ```
 *
 * @param mcpServerInstance - MCP server instance to instrument
 * @param options - Optional configuration for recording inputs and outputs
 * @returns Instrumented server instance (same reference)
 */
export function wrapMcpServerWithSentry<S extends object>(mcpServerInstance: S, options?: McpServerWrapperOptions): S {
  if (wrappedMcpServerInstances.has(mcpServerInstance)) {
    return mcpServerInstance;
  }

  if (!validateMcpServerInstance(mcpServerInstance)) {
    return mcpServerInstance;
  }

  const serverInstance = mcpServerInstance as MCPServerInstance;
  const client = getClient();
  const genAI = client?.getDataCollectionOptions().genAI;

  const resolvedOptions: ResolvedMcpOptions = {
    recordInputs: options?.recordInputs ?? genAI?.inputs ?? true,
    recordOutputs: options?.recordOutputs ?? genAI?.outputs ?? true,
  };

  fill(serverInstance, 'connect', originalConnect => {
    return async function (this: MCPServerInstance, transport: MCPTransport, ...restArgs: unknown[]) {
      const result = await (originalConnect as (...args: unknown[]) => Promise<unknown>).call(
        this,
        transport,
        ...restArgs,
      );

      wrapTransportOnMessage(transport, resolvedOptions);
      wrapTransportSend(transport, resolvedOptions);
      wrapTransportOnClose(transport);
      wrapTransportError(transport);

      return result;
    };
  });

  wrapAllMCPHandlers(serverInstance);

  wrapExistingHandlers(serverInstance);

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance;
}

/**
 * Wraps every MCP server produced by a factory with Sentry instrumentation.
 *
 * This helper is intended for MCP SDK serving entries which construct a fresh
 * server per request or connection, such as `createMcpHandler` and `serveStdio`.
 * It supports synchronous and asynchronous factories while preserving the
 * factory's arguments, `this` value, return type, and thrown or rejected errors.
 * Factory failures are captured as protocol Issues before being rethrown unchanged.
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/node';
 * import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
 *
 * const handler = createMcpHandler(
 *   Sentry.wrapMcpServerFactoryWithSentry(ctx => {
 *     const server = new McpServer({ name: 'my-server', version: '1.0.0' });
 *     server.registerTool('my-tool', schema, handler);
 *     return server;
 *   }),
 * );
 * ```
 *
 * @param factory - Factory which creates an MCP server instance
 * @param options - Optional configuration applied to every created server
 * @returns A factory with the same call signature and result type
 */
export function wrapMcpServerFactoryWithSentry<Factory extends (...args: never[]) => object | PromiseLike<object>>(
  factory: Factory,
  options?: McpServerWrapperOptions,
): Factory {
  return function (this: ThisParameterType<Factory>, ...args: Parameters<Factory>): ReturnType<Factory> {
    let result: ReturnType<Factory>;
    try {
      result = Reflect.apply(factory, this, args) as ReturnType<Factory>;
    } catch (error) {
      captureError(error, 'protocol', { method_name: 'server_factory' });
      throw error;
    }

    if (isThenable(result)) {
      return result.then(
        (server: object) => wrapMcpServerWithSentry(server, options),
        (error: unknown) => {
          captureError(error, 'protocol', { method_name: 'server_factory' });
          throw error;
        },
      ) as ReturnType<Factory>;
    }

    return wrapMcpServerWithSentry(result, options);
  } as unknown as Factory;
}
