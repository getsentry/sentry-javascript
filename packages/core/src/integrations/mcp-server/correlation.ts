/**
 * Request-span correlation system for MCP server instrumentation
 * Handles mapping requestId to span data for correlation with handler execution
 */

import { withActiveSpan } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import type { RequestId, SessionId } from './types';

// Simplified correlation system that works with or without sessionId
// Maps requestId directly to span data for stateless operation
const requestIdToSpanMap = new Map<RequestId, {
  span: Span;
  method: string;
  startTime: number;
}>();

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
      // Add tool-specific attributes
      const toolAttributes = extractToolResultAttributes(result);
      spanWithMethods.setAttributes(toolAttributes);
      
      // Set span status based on tool result
      if (toolAttributes['mcp.tool.result.is_error']) {
        spanWithMethods.setStatus({ 
          code: 2, // ERROR
          message: 'Tool execution failed' 
        });
      }
    }
    
    // Complete the span
    if (spanWithMethods.end) {
      spanWithMethods.end();
    }
    
    // Clean up correlation
    requestIdToSpanMap.delete(requestId);
  }
}

/**
 * Cleans up all pending spans (for transport close)
 */
export function cleanupAllPendingSpans(): number {
  const pendingCount = requestIdToSpanMap.size;
  
  for (const [, spanData] of requestIdToSpanMap) {
    const spanWithEnd = spanData.span as Span & { end: () => void; setStatus: (status: { code: number; message: string }) => void };
    if (spanWithEnd.setStatus && spanWithEnd.end) {
      spanWithEnd.setStatus({ 
        code: 2, // ERROR
        message: 'Transport closed before request completion' 
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
    
    // Check if this is an error result
    if (typeof resultObj.isError === 'boolean') {
      attributes['mcp.tool.result.is_error'] = resultObj.isError;
    }
    
    // Store content as-is (serialized)
    if (Array.isArray(resultObj.content)) {
      attributes['mcp.tool.result.content_count'] = resultObj.content.length;
      
      const serializedContent = JSON.stringify(resultObj.content);
      attributes['mcp.tool.result.content'] = serializedContent.length > 5000 
        ? `${serializedContent.substring(0, 4997)}...`
        : serializedContent;
    }
  }
  
  return attributes;
}