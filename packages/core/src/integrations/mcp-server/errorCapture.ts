/**
 * Safe error capture utilities for MCP server instrumentation
 * Ensures Sentry error reporting never interferes with MCP service operation
 */

import { getClient } from '../../currentScopes';
import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { getActiveSpan } from '../../utils/spanUtils';

/**
 * Safely captures an error to Sentry without affecting MCP service operation
 * The active span already contains all MCP context (method, tool, arguments, etc.)
 * Sentry automatically associates the error with the active span
 */
export function captureError(error: Error, errorType?: string, extraData?: Record<string, unknown>): void {
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
        type: 'mcp_server',
        handled: false,
        data: {
          error_type: errorType || 'handler_execution',
          ...extraData,
        },
      },
    });
  } catch {
    // Silently ignore capture errors - never affect MCP operation
  }
}
