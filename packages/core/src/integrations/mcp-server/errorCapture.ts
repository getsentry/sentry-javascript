/**
 * Safe error capture utilities for MCP server instrumentation
 * Ensures Sentry error reporting never interferes with MCP service operation
 */

import { getClient } from '../../currentScopes';
import { captureException } from '../../exports';

/**
 * Safely captures an error to Sentry without affecting MCP service operation
 * The active span already contains all MCP context (method, tool, arguments, etc.)
 * Sentry automatically associates the error with the active span
 */
export function captureError(error: Error, errorType?: string): void {
  try {
    const client = getClient();
    if (!client) {
      return
    }

    captureException(error, {
      tags: {
        mcp_error_type: errorType || 'handler_execution',
      },
    });
  } catch {
    // Silently ignore capture errors - never affect MCP operation
  }
}
