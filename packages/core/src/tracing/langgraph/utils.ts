import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { LangChainMessage } from '../langchain/types';
import { normalizeLangChainMessages } from '../langchain/utils';
import type { CompiledGraph, LangGraphTool } from './types';

/**
 * Extract tool calls from messages
 */
export function extractToolCalls(messages: Array<Record<string, unknown>> | null): unknown[] | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  const toolCalls: unknown[] = [];

  for (const message of messages) {
    if (message && typeof message === 'object') {
      const msgToolCalls = message.tool_calls;
      if (msgToolCalls && Array.isArray(msgToolCalls)) {
        toolCalls.push(...msgToolCalls);
      }
    }
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

/**
 * Extract token usage from a message's usage_metadata or response_metadata
 * Returns token counts without setting span attributes
 */
export function extractTokenUsageFromMessage(message: LangChainMessage): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const msg = message as Record<string, unknown>;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  // Extract from usage_metadata (newer format)
  if (msg.usage_metadata && typeof msg.usage_metadata === 'object') {
    const usage = msg.usage_metadata as Record<string, unknown>;
    if (typeof usage.input_tokens === 'number') {
      inputTokens = usage.input_tokens;
    }
    if (typeof usage.output_tokens === 'number') {
      outputTokens = usage.output_tokens;
    }
    if (typeof usage.total_tokens === 'number') {
      totalTokens = usage.total_tokens;
    }
    return { inputTokens, outputTokens, totalTokens };
  }

  // Fallback: Extract from response_metadata.tokenUsage
  if (msg.response_metadata && typeof msg.response_metadata === 'object') {
    const metadata = msg.response_metadata as Record<string, unknown>;
    if (metadata.tokenUsage && typeof metadata.tokenUsage === 'object') {
      const tokenUsage = metadata.tokenUsage as Record<string, unknown>;
      if (typeof tokenUsage.promptTokens === 'number') {
        inputTokens = tokenUsage.promptTokens;
      }
      if (typeof tokenUsage.completionTokens === 'number') {
        outputTokens = tokenUsage.completionTokens;
      }
      if (typeof tokenUsage.totalTokens === 'number') {
        totalTokens = tokenUsage.totalTokens;
      }
    }
  }

  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Extract model and finish reason from a message's response_metadata
 */
export function extractModelMetadata(span: Span, message: LangChainMessage): void {
  const msg = message as Record<string, unknown>;

  if (msg.response_metadata && typeof msg.response_metadata === 'object') {
    const metadata = msg.response_metadata as Record<string, unknown>;

    if (metadata.model_name && typeof metadata.model_name === 'string') {
      span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, metadata.model_name);
    }

    if (metadata.finish_reason && typeof metadata.finish_reason === 'string') {
      span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE, [metadata.finish_reason]);
    }
  }
}

/**
 * Extract tools from compiled graph structure
 *
 * Tools are stored in: compiledGraph.builder.nodes.tools.runnable.tools
 */
export function extractToolsFromCompiledGraph(compiledGraph: CompiledGraph): unknown[] | null {
  if (!compiledGraph.builder?.nodes?.tools?.runnable?.tools) {
    return null;
  }

  const tools = compiledGraph.builder?.nodes?.tools?.runnable?.tools;

  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  // Extract name, description, and schema from each tool's lc_kwargs
  return tools.map((tool: LangGraphTool) => ({
    name: tool.lc_kwargs?.name,
    description: tool.lc_kwargs?.description,
    schema: tool.lc_kwargs?.schema,
  }));
}

/**
 * Set response attributes on the span
 */
export function setResponseAttributes(span: Span, inputMessages: LangChainMessage[] | null, result: unknown): void {
  // Extract messages from result
  const resultObj = result as { messages?: LangChainMessage[] } | undefined;
  const outputMessages = resultObj?.messages;

  if (!outputMessages || !Array.isArray(outputMessages)) {
    return;
  }

  // Get new messages (delta between input and output)
  const inputCount = inputMessages?.length ?? 0;
  const newMessages = outputMessages.length > inputCount ? outputMessages.slice(inputCount) : [];

  if (newMessages.length === 0) {
    return;
  }

  // Extract and set tool calls from new messages BEFORE normalization
  // (normalization strips tool_calls, so we need to extract them first)
  const toolCalls = extractToolCalls(newMessages as Array<Record<string, unknown>>);
  if (toolCalls) {
    span.setAttribute(GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE, JSON.stringify(toolCalls));
  }

  // Normalize the new messages
  const normalizedNewMessages = normalizeLangChainMessages(newMessages);
  span.setAttribute(GEN_AI_RESPONSE_TEXT_ATTRIBUTE, JSON.stringify(normalizedNewMessages));

  // Accumulate token usage across all messages
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;

  // Extract metadata from messages
  for (const message of newMessages) {
    // Accumulate token usage
    const tokens = extractTokenUsageFromMessage(message);
    totalInputTokens += tokens.inputTokens;
    totalOutputTokens += tokens.outputTokens;
    totalTokens += tokens.totalTokens;

    // Extract model metadata (last message's metadata wins for model/finish_reason)
    extractModelMetadata(span, message);
  }

  // Set accumulated token usage on span
  if (totalInputTokens > 0) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE, totalInputTokens);
  }
  if (totalOutputTokens > 0) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE, totalOutputTokens);
  }
  if (totalTokens > 0) {
    span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE, totalTokens);
  }
}
