/**
 * Handler wrapping functions for MCP server methods
 * Provides span correlation for tool, resource, and prompt handlers
 */

import { DEBUG_BUILD } from '../../debug-build';
import { logger } from '../../utils/logger';
import { fill } from '../../utils/object';
import { associateContextWithRequestSpan } from './correlation';
import { captureError } from './errorCapture';
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

      const wrappedHandler = createWrappedHandler(handler as MCPHandler, methodName, name);
      return (originalMethod as (...args: unknown[]) => unknown).call(this, name, ...args.slice(0, -1), wrappedHandler);
    };
  });
}

/**
 * Creates a wrapped handler with span correlation and error capture
 */
function createWrappedHandler(originalHandler: MCPHandler, methodName: keyof MCPServerInstance, handlerName: string) {
  return function (this: unknown, ...handlerArgs: unknown[]): unknown {
    try {
      const extraHandlerData = findExtraHandlerData(handlerArgs);

      return associateContextWithRequestSpan(extraHandlerData, () => {
        return createErrorCapturingHandler.call(
          this,
          originalHandler,
          methodName,
          handlerName,
          handlerArgs,
          extraHandlerData,
        );
      });
    } catch (error) {
      DEBUG_BUILD && logger.warn('MCP handler wrapping failed:', error);
      return originalHandler.apply(this, handlerArgs);
    }
  };
}

/**
 * Creates a handler that captures execution errors for Sentry
 */
function createErrorCapturingHandler(
  this: MCPServerInstance,
  originalHandler: MCPHandler,
  methodName: keyof MCPServerInstance,
  handlerName: string,
  handlerArgs: unknown[],
  extraHandlerData?: HandlerExtraData,
): unknown {
  try {
    const result = originalHandler.apply(this, handlerArgs);

    // Handle both sync and async handlers
    if (result && typeof result === 'object' && 'then' in result) {
      // Async handler - wrap with error capture
      return (result as Promise<unknown>).catch((error: Error) => {
        captureHandlerError(error, methodName, handlerName, handlerArgs, extraHandlerData);
        throw error; // Re-throw to maintain MCP error handling behavior
      });
    }

    // Sync handler - return result as-is
    return result;
  } catch (error) {
    // Sync handler threw an error - capture it
    captureHandlerError(error as Error, methodName, handlerName, handlerArgs, extraHandlerData);
    throw error; // Re-throw to maintain MCP error handling behavior
  }
}

/**
 * Captures handler execution errors based on handler type
 */
function captureHandlerError(
  error: Error,
  methodName: keyof MCPServerInstance,
  handlerName: string,
  _handlerArgs: unknown[],
  _extraHandlerData?: HandlerExtraData,
): void {
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
      captureError(error, 'resource_operation', extraData);
    } else if (methodName === 'prompt') {
      extraData.prompt_name = handlerName;
      captureError(error, 'prompt_execution', extraData);
    }
  } catch (captureErr) {
    // silently ignore capture errors to not affect MCP operation
  }
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
