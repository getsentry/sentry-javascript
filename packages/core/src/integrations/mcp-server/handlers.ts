/**
 * Handler wrapping functions for MCP server methods
 * Provides span correlation for tool, resource, and prompt handlers
 */

import { DEBUG_BUILD } from '../../debug-build';
import { logger } from '../../utils/logger';
import { fill } from '../../utils/object';
import { associateContextWithRequestSpan } from './correlation';
import type { HandlerExtraData, MCPHandler, MCPServerInstance } from './types';

/**
 * Generic function to wrap MCP server method handlers
 */
function wrapMethodHandler(serverInstance: MCPServerInstance, methodName: keyof MCPServerInstance): void {
  fill(serverInstance, methodName, originalMethod => {
    return function (this: MCPServerInstance, name: string, ...args: unknown[]) {
      const handler = args[args.length - 1];

      if (typeof handler !== 'function') {
        return (originalMethod as (...args: unknown[]) => unknown).call(this, name, ...args);
      }

      const wrappedHandler = createWrappedHandler(handler as MCPHandler);
      return (originalMethod as (...args: unknown[]) => unknown).call(this, name, ...args.slice(0, -1), wrappedHandler);
    };
  });
}

/**
 * Creates a wrapped handler with span correlation
 */
function createWrappedHandler(originalHandler: MCPHandler) {
  return function (this: unknown, ...handlerArgs: unknown[]): unknown {
    try {
      const extraHandlerData = findExtraHandlerData(handlerArgs);

      return associateContextWithRequestSpan(extraHandlerData, () => {
        return originalHandler.apply(this, handlerArgs);
      });
    } catch (error) {
      DEBUG_BUILD && logger.warn('MCP handler wrapping failed:', error);
      return originalHandler.apply(this, handlerArgs);
    }
  };
}

/**
 * Extracts request/session data from handler arguments
 */
function findExtraHandlerData(handlerArgs: unknown[]): HandlerExtraData | undefined {
  return handlerArgs.find(
    (arg): arg is HandlerExtraData =>
      arg != null && typeof arg === 'object' && 'requestId' in arg && (arg as { requestId: unknown }).requestId != null,
  );
}

/**
 * Wraps tool handlers to associate them with request spans
 */
export function wrapToolHandlers(serverInstance: MCPServerInstance): void {
  wrapMethodHandler(serverInstance, 'tool');
}

/**
 * Wraps resource handlers to associate them with request spans
 */
export function wrapResourceHandlers(serverInstance: MCPServerInstance): void {
  wrapMethodHandler(serverInstance, 'resource');
}

/**
 * Wraps prompt handlers to associate them with request spans
 */
export function wrapPromptHandlers(serverInstance: MCPServerInstance): void {
  wrapMethodHandler(serverInstance, 'prompt');
}

/**
 * Wraps all MCP handler types (tool, resource, prompt) for span correlation
 */
export function wrapAllMCPHandlers(serverInstance: MCPServerInstance): void {
  wrapToolHandlers(serverInstance);
  wrapResourceHandlers(serverInstance);
  wrapPromptHandlers(serverInstance);
}