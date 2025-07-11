/**
 * Message validation functions for MCP server instrumentation
 */

import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/logger';
import type { JsonRpcNotification, JsonRpcRequest } from './types';

/** Validates if a message is a JSON-RPC request */
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

/** Validates if a message is a JSON-RPC notification */
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

/** Validates if a message is a JSON-RPC response */
export function isJsonRpcResponse(
  message: unknown,
): message is { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: unknown } {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as { jsonrpc: string }).jsonrpc === '2.0' &&
    'id' in message &&
    ('result' in message || 'error' in message)
  );
}

/** Validates MCP server instance with type checking */
export function validateMcpServerInstance(instance: unknown): boolean {
  if (
    typeof instance === 'object' &&
    instance !== null &&
    'resource' in instance &&
    'tool' in instance &&
    'prompt' in instance &&
    'connect' in instance
  ) {
    return true;
  }
  DEBUG_BUILD && debug.warn('Did not patch MCP server. Interface is incompatible.');
  return false;
}
