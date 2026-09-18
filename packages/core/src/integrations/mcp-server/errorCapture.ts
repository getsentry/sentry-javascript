/**
 * Safe error capture utilities for MCP server instrumentation
 *
 * Ensures error reporting never interferes with MCP server operation.
 * All capture operations are wrapped in try-catch to prevent side effects.
 */

import { getClient } from '../../currentScopes';
import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { getActiveSpan } from '../../utils/spanUtils';
import type { McpErrorType } from './types';

/** Classifies JSON-RPC responses using the MCP server (not client) semantic conventions. */
export function isJsonRpcServerError(code: number): boolean {
  // https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md#server
  return ![-32700, -32600, -32601, -32602, -32002].includes(code);
}

/**
 * Captures an error without affecting MCP server operation.
 *
 * The active span already contains all MCP context (method, tool, arguments, etc.)
 * @param error - Error to capture
 * @param errorType - Classification of error type for filtering
 * @param extraData - Additional context data to include
 */
export function captureError(error: Error, errorType?: McpErrorType, extraData?: Record<string, unknown>): void {
  try {
    const client = getClient();
    if (!client) {
      return;
    }

    const activeSpan = getActiveSpan();
    if (activeSpan?.isRecording()) {
      activeSpan.setStatus({
        code: SPAN_STATUS_ERROR,
        message: 'internal_error',
      });
    }

    captureException(error, {
      mechanism: {
        type: 'auto.ai.mcp_server',
        handled: false,
        data: {
          error_type: errorType || 'handler_execution',
          ...extraData,
        },
      },
    });
  } catch {
    // noop
  }
}
