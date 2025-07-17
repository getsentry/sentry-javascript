/**
 * Request-span correlation system for MCP server instrumentation
 * Handles mapping requestId to span data for correlation with handler execution
 */

import { getClient } from '../../currentScopes';
import { SPAN_STATUS_ERROR, withActiveSpan } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import { extractToolResultAttributes } from './attributeExtraction';
import { filterMcpPiiFromSpanData } from './piiFiltering';
import type { RequestId, RequestSpanMapValue } from './types';

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
  extraHandlerData: { requestId: RequestId } | undefined,
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
      message: 'cancelled',
    });
    spanData.span.end();
  }

  requestIdToSpanMap.clear();
  return pendingCount;
}
