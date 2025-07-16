/**
 * Request-span correlation system for MCP server instrumentation
 * Handles mapping requestId to span data for correlation with handler execution
 */

import { getClient } from '../../currentScopes';
import { SPAN_STATUS_ERROR, withActiveSpan } from '../../tracing';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  MCP_TOOL_RESULT_CONTENT_ATTRIBUTE,
  MCP_TOOL_RESULT_CONTENT_COUNT_ATTRIBUTE,
  MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE,
} from './attributes';
import { captureError } from './errorCapture';
import { filterMcpPiiFromSpanData } from './piiFiltering';
import type { RequestId, RequestSpanMapValue, SessionId } from './types';

// Simplified correlation system that works with or without sessionId
// Maps requestId directly to span data for stateless operation
const requestIdToSpanMap = new Map<RequestId, RequestSpanMapValue>();

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

    if (method === 'tools/call') {
      // Add tool-specific attributes with PII filtering
      const rawToolAttributes = extractToolResultAttributes(result);
      const client = getClient();
      const sendDefaultPii = Boolean(client?.getOptions().sendDefaultPii);
      const toolAttributes = filterMcpPiiFromSpanData(rawToolAttributes, sendDefaultPii);

      span.setAttributes(toolAttributes);

      const isToolError = rawToolAttributes[MCP_TOOL_RESULT_IS_ERROR_ATTRIBUTE] === true;

      if (isToolError) {
        span.setStatus({
          code: SPAN_STATUS_ERROR,
          message: 'Tool returned error result',
        });

        captureError(new Error('Tool returned error result'), 'tool_execution');
      }
    }

    span.end();
    requestIdToSpanMap.delete(requestId);
  }
}

/**
 * Cleans up all pending spans (for transport close)
 */
export function cleanupAllPendingSpans(): number {
  const pendingCount = requestIdToSpanMap.size;

  for (const [, spanData] of requestIdToSpanMap) {
    spanData.span.setStatus({
      code: SPAN_STATUS_ERROR,
      message: 'Transport closed before request completion',
    });
    spanData.span.end();
  }

  requestIdToSpanMap.clear();
  return pendingCount;
}

/**
 * Simplified tool result attribute extraction
 */
function extractToolResultAttributes(result: unknown): Record<string, SpanAttributeValue | undefined> {
  const attributes: Record<string, SpanAttributeValue | undefined> = {};

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
