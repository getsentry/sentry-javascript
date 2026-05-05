/**
 * Handler method wrapping for MCP server instrumentation
 *
 * Provides automatic error capture and span correlation for tool, resource,
 * and prompt handlers.
 */

import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { fill } from '../../utils/object';
import { captureError } from './errorCapture';
import type { MCPHandler, MCPServerInstance } from './types';

/**
 * Generic function to wrap MCP server method handlers
 * @internal
 * @param serverInstance - MCP server instance
 * @param methodName - Method name to wrap (tool, resource, prompt)
 */
function wrapMethodHandler(serverInstance: MCPServerInstance, methodName: keyof MCPServerInstance): void {
  fill(serverInstance, methodName, originalMethod => {
    return function (this: MCPServerInstance, name: string, ...args: unknown[]) {
      const handler = args[args.length - 1];

      if (typeof handler !== 'function') {
        return (originalMethod as (...args: unknown[]) => unknown).call(this, name, ...args);
      }

      const wrappedHandler = createWrappedHandler(handler as MCPHandler, methodName, name);
      return (originalMethod as (...args: unknown[]) => unknown).call(this, name, ...args.slice(0, -1), wrappedHandler);
    };
  });
}

/**
 * Creates a wrapped handler with span correlation and error capture
 * @internal
 * @param originalHandler - Original handler function
 * @param methodName - MCP method name
 * @param handlerName - Handler identifier
 * @returns Wrapped handler function
 */
function createWrappedHandler(originalHandler: MCPHandler, methodName: keyof MCPServerInstance, handlerName: string) {
  return function (this: unknown, ...handlerArgs: unknown[]): unknown {
    try {
      return createErrorCapturingHandler.call(this, originalHandler, methodName, handlerName, handlerArgs);
    } catch (error) {
      DEBUG_BUILD && debug.warn('MCP handler wrapping failed:', error);
      return originalHandler.apply(this, handlerArgs);
    }
  };
}

/**
 * Creates an error-capturing wrapper for handler execution
 * @internal
 * @param originalHandler - Original handler function
 * @param methodName - MCP method name
 * @param handlerName - Handler identifier
 * @param handlerArgs - Handler arguments
 * @param extraHandlerData - Additional handler context
 * @returns Handler execution result
 */
function createErrorCapturingHandler(
  this: MCPServerInstance,
  originalHandler: MCPHandler,
  methodName: keyof MCPServerInstance,
  handlerName: string,
  handlerArgs: unknown[],
): unknown {
  try {
    const result = originalHandler.apply(this, handlerArgs);

    if (result && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
      return Promise.resolve(result).catch(error => {
        captureHandlerError(error, methodName, handlerName);
        throw error;
      });
    }

    return result;
  } catch (error) {
    captureHandlerError(error as Error, methodName, handlerName);
    throw error;
  }
}

/**
 * Captures handler execution errors based on handler type
 * @internal
 * @param error - Error to capture
 * @param methodName - MCP method name
 * @param handlerName - Handler identifier
 */
function captureHandlerError(error: Error, methodName: keyof MCPServerInstance, handlerName: string): void {
  try {
    const extraData: Record<string, unknown> = {};

    if (methodName === 'tool' || methodName === 'registerTool') {
      extraData.tool_name = handlerName;

      if (
        error.name === 'ProtocolValidationError' ||
        error.message.includes('validation') ||
        error.message.includes('protocol')
      ) {
        captureError(error, 'validation', extraData);
      } else if (
        error.name === 'ServerTimeoutError' ||
        error.message.includes('timed out') ||
        error.message.includes('timeout')
      ) {
        captureError(error, 'timeout', extraData);
      } else {
        captureError(error, 'tool_execution', extraData);
      }
    } else if (methodName === 'resource' || methodName === 'registerResource') {
      extraData.resource_uri = handlerName;
      captureError(error, 'resource_execution', extraData);
    } else if (methodName === 'prompt' || methodName === 'registerPrompt') {
      extraData.prompt_name = handlerName;
      captureError(error, 'prompt_execution', extraData);
    }
  } catch (_captureErr) {
    // noop
  }
}

/**
 * Wraps tool handlers to associate them with request spans.
 * Instruments both `tool` (legacy API) and `registerTool` (new API) if present.
 * @param serverInstance - MCP server instance
 */
export function wrapToolHandlers(serverInstance: MCPServerInstance): void {
  if (typeof serverInstance.tool === 'function') wrapMethodHandler(serverInstance, 'tool');
  if (typeof serverInstance.registerTool === 'function') wrapMethodHandler(serverInstance, 'registerTool');
}

/**
 * Wraps resource handlers to associate them with request spans.
 * Instruments both `resource` (legacy API) and `registerResource` (new API) if present.
 * @param serverInstance - MCP server instance
 */
export function wrapResourceHandlers(serverInstance: MCPServerInstance): void {
  if (typeof serverInstance.resource === 'function') wrapMethodHandler(serverInstance, 'resource');
  if (typeof serverInstance.registerResource === 'function') wrapMethodHandler(serverInstance, 'registerResource');
}

/**
 * Wraps prompt handlers to associate them with request spans.
 * Instruments both `prompt` (legacy API) and `registerPrompt` (new API) if present.
 * @param serverInstance - MCP server instance
 */
export function wrapPromptHandlers(serverInstance: MCPServerInstance): void {
  if (typeof serverInstance.prompt === 'function') wrapMethodHandler(serverInstance, 'prompt');
  if (typeof serverInstance.registerPrompt === 'function') wrapMethodHandler(serverInstance, 'registerPrompt');
}

/**
 * Wraps all MCP handler types for span correlation.
 * Supports both the legacy API (`tool`, `resource`, `prompt`) and the newer API
 * (`registerTool`, `registerResource`, `registerPrompt`), instrumenting whichever methods are present.
 * @param serverInstance - MCP server instance
 */
export function wrapAllMCPHandlers(serverInstance: MCPServerInstance): void {
  wrapToolHandlers(serverInstance);
  wrapResourceHandlers(serverInstance);
  wrapPromptHandlers(serverInstance);
}

/**
 * Retroactively wraps handlers on tools, resources, and prompts that were registered
 * before `wrapMcpServerWithSentry` was called.
 *
 * The MCP SDK stores registered entries in private maps and invokes them via the entry's
 * own property at call time — `executor` for tools, `readCallback` for resources, and
 * `handler` for prompts. Replacing those properties
 * in-place is therefore equivalent to having wrapped the original registration call.
 *
 * NOTE: This intentionally accesses private MCP SDK internals (`_registeredTools` etc.).
 * The properties and their shapes are verified against @modelcontextprotocol/sdk source:
 * https://github.com/modelcontextprotocol/typescript-sdk/blob/2c0c481cb9dbfd15c8613f765c940a5f5bace94d/packages/server/src/server/mcp.ts#L304
 * When upgrading the MCP SDK, re-verify that these internal maps and their callable
 * properties still exist and are invoked directly (not captured by closure at registration).
 * All access is defensive — if a property is absent or not a function we skip silently.
 * @internal
 */
export function wrapExistingHandlers(serverInstance: MCPServerInstance): void {
  const server = serverInstance as unknown as Record<string, unknown>;

  // Tools: MCP SDK calls registeredTool.executor (generated from handler at registration time)
  const registeredTools = server['_registeredTools'];
  if (registeredTools && typeof registeredTools === 'object') {
    for (const [name, tool] of Object.entries(registeredTools as Record<string, Record<string, unknown>>)) {
      if (typeof tool['executor'] === 'function') {
        tool['executor'] = createWrappedHandler(tool['executor'] as MCPHandler, 'registerTool', name);
      }
    }
  }

  // Resources: MCP SDK calls registeredResource.readCallback
  const registeredResources = server['_registeredResources'];
  if (registeredResources && typeof registeredResources === 'object') {
    for (const [name, resource] of Object.entries(registeredResources as Record<string, Record<string, unknown>>)) {
      if (typeof resource['readCallback'] === 'function') {
        resource['readCallback'] = createWrappedHandler(
          resource['readCallback'] as MCPHandler,
          'registerResource',
          name,
        );
      }
    }
  }

  // Resource templates: MCP SDK calls registeredResourceTemplate.readCallback
  const registeredResourceTemplates = server['_registeredResourceTemplates'];
  if (registeredResourceTemplates && typeof registeredResourceTemplates === 'object') {
    for (const [name, template] of Object.entries(
      registeredResourceTemplates as Record<string, Record<string, unknown>>,
    )) {
      if (typeof template['readCallback'] === 'function') {
        template['readCallback'] = createWrappedHandler(
          template['readCallback'] as MCPHandler,
          'registerResource',
          name,
        );
      }
    }
  }

  // Prompts: MCP SDK calls registeredPrompt.handler
  const registeredPrompts = server['_registeredPrompts'];
  if (registeredPrompts && typeof registeredPrompts === 'object') {
    for (const [name, prompt] of Object.entries(registeredPrompts as Record<string, Record<string, unknown>>)) {
      if (typeof prompt['handler'] === 'function') {
        prompt['handler'] = createWrappedHandler(prompt['handler'] as MCPHandler, 'registerPrompt', name);
      }
    }
  }
}
