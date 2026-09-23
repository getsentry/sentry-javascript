import { fill } from '../../utils/object';
import { wrapAllMCPHandlers, wrapExistingHandlers } from './handlers';
import { wrapTransportError, wrapTransportOnClose, wrapTransportOnMessage, wrapTransportSend } from './transport';
import type { MCPServerInstance, McpServerWrapperOptions, MCPTransport } from './types';
import { validateMcpServerInstance } from './validation';

/**
 * Tracks wrapped MCP server instances to prevent double-wrapping
 * @internal
 */
const wrappedMcpServerInstances = new WeakSet();

function instrumentTransport(transport: MCPTransport, options: McpServerWrapperOptions): void {
  wrapTransportOnMessage(transport, options);
  wrapTransportSend(transport, options);
  wrapTransportOnClose(transport);
  wrapTransportError(transport);
}

function interceptTransportStart(transport: MCPTransport, beforeStart: () => void): () => void {
  let transportStart: MCPTransport['start'];
  let originalDescriptor: PropertyDescriptor | undefined;

  try {
    transportStart = transport.start;
    originalDescriptor = Object.getOwnPropertyDescriptor(transport, 'start');
  } catch {
    return () => undefined;
  }

  if (typeof transportStart !== 'function') {
    return () => undefined;
  }

  const originalStart = transportStart;
  let isInstalled = false;

  const restoreStart = (): void => {
    if (!isInstalled) {
      return;
    }

    try {
      const currentDescriptor = Object.getOwnPropertyDescriptor(transport, 'start');
      if (currentDescriptor?.value !== interceptedStart) {
        isInstalled = false;
        return;
      }

      if (originalDescriptor) {
        Object.defineProperty(transport, 'start', originalDescriptor);
        isInstalled = false;
      } else if (Reflect.deleteProperty(transport, 'start')) {
        isInstalled = false;
      }
    } catch {}
  };

  function interceptedStart(this: MCPTransport): Promise<void> {
    // Restoring first keeps recursive calls and user-observed method identity identical to the original transport.
    restoreStart();
    beforeStart();
    return originalStart.call(this);
  }

  const replacementDescriptor: PropertyDescriptor =
    originalDescriptor && 'value' in originalDescriptor
      ? { ...originalDescriptor, value: interceptedStart }
      : {
          configurable: originalDescriptor?.configurable ?? true,
          enumerable: originalDescriptor?.enumerable ?? false,
          writable: true,
          value: interceptedStart,
        };

  try {
    Object.defineProperty(transport, 'start', replacementDescriptor);
    isInstalled = true;
  } catch {
    // The post-connect fallback preserves the previous behavior for transports which cannot be patched.
  }

  return restoreStart;
}

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
 * const server = Sentry.wrapMcpServerWithSentry(
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
  const captureOptions: McpServerWrapperOptions = { ...options };

  fill(serverInstance, 'connect', originalConnect => {
    return async function (this: MCPServerInstance, transport: MCPTransport, ...restArgs: unknown[]) {
      let isTransportInstrumented = false;
      const instrumentTransportOnce = (): void => {
        if (isTransportInstrumented) {
          return;
        }

        isTransportInstrumented = true;
        instrumentTransport(transport, captureOptions);
      };
      const restoreStart = interceptTransportStart(transport, instrumentTransportOnce);

      try {
        const result = await (originalConnect as (...args: unknown[]) => Promise<unknown>).call(
          this,
          transport,
          ...restArgs,
        );

        instrumentTransportOnce();

        return result;
      } finally {
        restoreStart();
      }
    };
  });

  wrapAllMCPHandlers(serverInstance);

  wrapExistingHandlers(serverInstance);

  wrappedMcpServerInstances.add(mcpServerInstance);
  return mcpServerInstance;
}
