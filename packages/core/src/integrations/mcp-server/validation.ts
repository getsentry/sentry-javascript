/**
 * Message validation functions for MCP server instrumentation
 *
 * Provides JSON-RPC 2.0 message type validation and MCP server instance validation.
 */

import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from './types';

/**
 * Validates if a message is a JSON-RPC request
 * @param message - Message to validate
 * @returns True if message is a JSON-RPC request
 */
export function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as JsonRpcRequest).jsonrpc === '2.0' &&
    'method' in message &&
    'id' in message
  );
}

/**
 * Validates if a message is a JSON-RPC notification
 * @param message - Message to validate
 * @returns True if message is a JSON-RPC notification
 */
export function isJsonRpcNotification(message: unknown): message is JsonRpcNotification {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as JsonRpcNotification).jsonrpc === '2.0' &&
    'method' in message &&
    !('id' in message)
  );
}

/**
 * Validates if a message is a JSON-RPC response
 * @param message - Message to validate
 * @returns True if message is a JSON-RPC response
 */
export function isJsonRpcResponse(message: unknown): message is JsonRpcResponse {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as { jsonrpc: string }).jsonrpc === '2.0' &&
    'id' in message &&
    ('result' in message || 'error' in message)
  );
}

/**
 * Validates MCP server instance with type checking.
 * Accepts both the legacy API (`tool`, `resource`, `prompt`) used in SDK 1.x
 * and the newer API (`registerTool`, `registerResource`, `registerPrompt`) introduced
 * alongside the legacy API in SDK 1.x and made the only option in SDK 2.x.
 * @param instance - Object to validate as MCP server instance
 * @returns True if instance has required MCP server methods
 */
export function validateMcpServerInstance(instance: unknown): boolean {
  if (
    typeof instance === 'object' &&
    instance !== null &&
    'connect' in instance &&
    (('tool' in instance && 'resource' in instance && 'prompt' in instance) ||
      ('registerTool' in instance && 'registerResource' in instance && 'registerPrompt' in instance))
  ) {
    return true;
  }
  DEBUG_BUILD && debug.warn('Did not patch MCP server. Interface is incompatible.');
  return false;
}

/**
 * Check if the item is a valid content item
 * @param item - The item to check
 * @returns True if the item is a valid content item, false otherwise
 */
export function isValidContentItem(item: unknown): item is Record<string, unknown> {
  return item != null && typeof item === 'object';
}
