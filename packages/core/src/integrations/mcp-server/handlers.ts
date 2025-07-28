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

    if (methodName === 'tool') {
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
    } else if (methodName === 'resource') {
      extraData.resource_uri = handlerName;
      captureError(error, 'resource_execution', extraData);
    } else if (methodName === 'prompt') {
      extraData.prompt_name = handlerName;
      captureError(error, 'prompt_execution', extraData);
    }
  } catch (captureErr) {
    // noop
  }
}

/**
 * Wraps tool handlers to associate them with request spans
 * @param serverInstance - MCP server instance
 */
export function wrapToolHandlers(serverInstance: MCPServerInstance): void {
  wrapMethodHandler(serverInstance, 'tool');
}

/**
 * Wraps resource handlers to associate them with request spans
 * @param serverInstance - MCP server instance
 */
export function wrapResourceHandlers(serverInstance: MCPServerInstance): void {
  wrapMethodHandler(serverInstance, 'resource');
}

/**
 * Wraps prompt handlers to associate them with request spans
 * @param serverInstance - MCP server instance
 */
export function wrapPromptHandlers(serverInstance: MCPServerInstance): void {
  wrapMethodHandler(serverInstance, 'prompt');
}

/**
 * Wraps all MCP handler types (tool, resource, prompt) for span correlation
 * @param serverInstance - MCP server instance
 */
export function wrapAllMCPHandlers(serverInstance: MCPServerInstance): void {
  wrapToolHandlers(serverInstance);
  wrapResourceHandlers(serverInstance);
  wrapPromptHandlers(serverInstance);
}
