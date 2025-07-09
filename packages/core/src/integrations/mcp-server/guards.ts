import type { JsonRpcNotification, JsonRpcRequest } from './types';
import { DEBUG_BUILD } from '../../debug-build';
import { logger } from '../../utils/logger';

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

/** Validates MCP server instance with comprehensive type checking */
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
  DEBUG_BUILD && logger.warn('Did not patch MCP server. Interface is incompatible.');
  return false;
} 