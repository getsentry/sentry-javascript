/**
 * Request-span correlation system for MCP server instrumentation
 * Handles mapping requestId to span data for correlation with handler execution
 */

import { getClient } from '../../currentScopes';
import { withActiveSpan } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import {
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE,
  MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE,
} from './attributes';
import { captureError } from './errorCapture';
import { filterMcpPiiFromSpanData } from './piiFiltering';
import type { RequestId, SessionId } from './types';

// Simplified correlation system that works with or without sessionId
// Maps requestId directly to span data for stateless operation
const requestIdToSpanMap = new Map<
  RequestId,
  {
    span: Span;
    method: string;
    startTime: number;
  }
>();

/**
 * Stores span context for later correlation with handler execution
 */
export function storeSpanForRequest(requestId: RequestId, span: Span, method: string): void {
  requestIdToSpanMap.set(requestId, {
    span,
    method,
    startTime: Date.now(),
  });
}

/**
 * Associates handler execution with the corresponding request span
 */
export function associateContextWithRequestSpan<T>(
  extraHandlerData: { sessionId?: SessionId; requestId: RequestId } | undefined,
  cb: () => T,
): T {
  if (extraHandlerData) {
    const { requestId } = extraHandlerData;

    const spanData = requestIdToSpanMap.get(requestId);
    if (!spanData) {
      return cb();
    }

    // Keep span in map for response enrichment (don't delete yet)
    return withActiveSpan(spanData.span, () => {
      return cb();
    });
  }

  return cb();
}

/**
 * Completes span with tool results and cleans up correlation
 */
export function completeSpanWithResults(requestId: RequestId, result: unknown): void {
  const spanData = requestIdToSpanMap.get(requestId);
  if (spanData) {
    const { span, method } = spanData;

    const spanWithMethods = span as Span & {
      setAttributes: (attrs: Record<string, unknown>) => void;
      setStatus: (status: { code: number; message: string }) => void;
      end: () => void;
    };

    if (spanWithMethods.setAttributes && method === 'tools/call') {
      // Add tool-specific attributes with PII filtering
      const rawToolAttributes = extractToolResultAttributes(result);
      const client = getClient();
      const sendDefaultPii = Boolean(client?.getOptions().sendDefaultPii);
      const toolAttributes = filterMcpPiiFromSpanData(rawToolAttributes, sendDefaultPii);

      spanWithMethods.setAttributes(toolAttributes);

      const isToolError = rawToolAttributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] === true;

      if (isToolError) {
        spanWithMethods.setStatus({
          code: 2, // ERROR
          message: 'Tool execution failed',
        });

        captureError(new Error('Tool returned error result'), 'tool_execution');
      }
    }

    if (spanWithMethods.end) {
      spanWithMethods.end();
    }

    requestIdToSpanMap.delete(requestId);
  }
}

/**
 * Cleans up all pending spans (for transport close)
 */
export function cleanupAllPendingSpans(): number {
  const pendingCount = requestIdToSpanMap.size;

  for (const [, spanData] of requestIdToSpanMap) {
    const spanWithEnd = spanData.span as Span & {
      end: () => void;
      setStatus: (status: { code: number; message: string }) => void;
    };
    if (spanWithEnd.setStatus && spanWithEnd.end) {
      spanWithEnd.setStatus({
        code: 2, // ERROR
        message: 'Transport closed before request completion',
      });
      spanWithEnd.end();
    }
  }

  requestIdToSpanMap.clear();
  return pendingCount;
}

/**
 * Simplified tool result attribute extraction
 */
function extractToolResultAttributes(result: unknown): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};

  if (typeof result === 'object' && result !== null) {
    const resultObj = result as Record<string, unknown>;

    if (typeof resultObj.isError === 'boolean') {
      attributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] = resultObj.isError;
    }

    if (Array.isArray(resultObj.content)) {
      attributes[MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE] = resultObj.content.length;

      const serializedContent = JSON.stringify(resultObj.content);
      attributes[MCP_TOOL_RESULT_CONTENT_ATTRIBUTE] =
        serializedContent.length > 5000 ? `${serializedContent.substring(0, 4997)}...` : serializedContent;
    }
  }

  return attributes;
}
