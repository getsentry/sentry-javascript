import type { TraceContext } from '../../types-hoist/context';
import type { Span, SpanJSON } from '../../types-hoist/span';
import { GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE } from '../ai/gen-ai-attributes';
import { toolCallSpanMap } from './constants';
import type { TokenSummary } from './types';

/**
 * Accumulates token data from a span to its parent in the token accumulator map.
 * This function extracts token usage from the current span and adds it to the
 * accumulated totals for its parent span.
 */
export function accumulateTokensForParent(span: SpanJSON, tokenAccumulator: Map<string, TokenSummary>): void {
  const parentSpanId = span.parent_span_id;
  if (!parentSpanId) {
    return;
  }

  const inputTokens = span.data[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
  const outputTokens = span.data[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE];

  if (typeof inputTokens === 'number' || typeof outputTokens === 'number') {
    const existing = tokenAccumulator.get(parentSpanId) || { inputTokens: 0, outputTokens: 0 };

    if (typeof inputTokens === 'number') {
      existing.inputTokens += inputTokens;
    }
    if (typeof outputTokens === 'number') {
      existing.outputTokens += outputTokens;
    }

    tokenAccumulator.set(parentSpanId, existing);
  }
}

/**
 * Applies accumulated token data to the `gen_ai.invoke_agent` span.
 * Only immediate children of the `gen_ai.invoke_agent` span are considered,
 * since aggregation will automatically occur for each parent span.
 */
export function applyAccumulatedTokens(
  spanOrTrace: SpanJSON | TraceContext,
  tokenAccumulator: Map<string, TokenSummary>,
): void {
  const accumulated = tokenAccumulator.get(spanOrTrace.span_id);
  if (!accumulated || !spanOrTrace.data) {
    return;
  }

  if (accumulated.inputTokens > 0) {
    spanOrTrace.data[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = accumulated.inputTokens;
  }
  if (accumulated.outputTokens > 0) {
    spanOrTrace.data[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] = accumulated.outputTokens;
  }
  if (accumulated.inputTokens > 0 || accumulated.outputTokens > 0) {
    spanOrTrace.data['gen_ai.usage.total_tokens'] = accumulated.inputTokens + accumulated.outputTokens;
  }
}

/**
 * Get the span associated with a tool call ID
 */
export function _INTERNAL_getSpanForToolCallId(toolCallId: string): Span | undefined {
  return toolCallSpanMap.get(toolCallId);
}

/**
 * Clean up the span mapping for a tool call ID
 */
export function _INTERNAL_cleanupToolCallSpan(toolCallId: string): void {
  toolCallSpanMap.delete(toolCallId);
}

/**
 * Convert an array of tool strings to a JSON string
 */
export function convertAvailableToolsToJsonString(tools: unknown[]): string {
  const toolObjects = tools.map(tool => {
    if (typeof tool === 'string') {
      try {
        return JSON.parse(tool);
      } catch {
        return tool;
      }
    }
    return tool;
  });
  return JSON.stringify(toolObjects);
}
