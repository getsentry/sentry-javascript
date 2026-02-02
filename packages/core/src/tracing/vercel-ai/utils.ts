import type { TraceContext } from '../../types-hoist/context';
import type { Span, SpanAttributes, SpanJSON } from '../../types-hoist/span';
import {
  GEN_AI_EMBED_DO_EMBED_OPERATION_ATTRIBUTE,
  GEN_AI_EMBED_MANY_DO_EMBED_OPERATION_ATTRIBUTE,
  GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE,
  GEN_AI_GENERATE_OBJECT_DO_GENERATE_OPERATION_ATTRIBUTE,
  GEN_AI_GENERATE_TEXT_DO_GENERATE_OPERATION_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
  GEN_AI_STREAM_OBJECT_DO_STREAM_OPERATION_ATTRIBUTE,
  GEN_AI_STREAM_TEXT_DO_STREAM_OPERATION_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { extractSystemInstructions, getTruncatedJsonString } from '../ai/utils';
import { toolCallSpanMap } from './constants';
import type { TokenSummary } from './types';
import { AI_PROMPT_ATTRIBUTE, AI_PROMPT_MESSAGES_ATTRIBUTE } from './vercel-ai-attributes';

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

/**
 * Convert the prompt string to messages array
 */
export function convertPromptToMessages(prompt: string): { role: string; content: string }[] {
  try {
    const p = JSON.parse(prompt);
    if (!!p && typeof p === 'object') {
      const { prompt, system } = p;
      if (typeof prompt === 'string' || typeof system === 'string') {
        const messages: { role: string; content: string }[] = [];
        if (typeof system === 'string') {
          messages.push({ role: 'system', content: system });
        }
        if (typeof prompt === 'string') {
          messages.push({ role: 'user', content: prompt });
        }
        return messages;
      }
    }
    // eslint-disable-next-line no-empty
  } catch {}
  return [];
}

/**
 * Generate a request.messages JSON array from the prompt field in the
 * invoke_agent op
 */
export function requestMessagesFromPrompt(span: Span, attributes: SpanAttributes): void {
  if (attributes[AI_PROMPT_ATTRIBUTE]) {
    const truncatedPrompt = getTruncatedJsonString(attributes[AI_PROMPT_ATTRIBUTE] as string | string[]);
    span.setAttribute('gen_ai.prompt', truncatedPrompt);
  }
  const prompt = attributes[AI_PROMPT_ATTRIBUTE];
  if (
    typeof prompt === 'string' &&
    !attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] &&
    !attributes[AI_PROMPT_MESSAGES_ATTRIBUTE]
  ) {
    const messages = convertPromptToMessages(prompt);
    if (messages.length) {
      const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

      if (systemInstructions) {
        span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE, systemInstructions);
      }

      const filteredLength = Array.isArray(filteredMessages) ? filteredMessages.length : 0;
      span.setAttributes({
        [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: getTruncatedJsonString(filteredMessages),
        [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: filteredLength,
      });
    }
  } else if (typeof attributes[AI_PROMPT_MESSAGES_ATTRIBUTE] === 'string') {
    try {
      const messages = JSON.parse(attributes[AI_PROMPT_MESSAGES_ATTRIBUTE]);
      if (Array.isArray(messages)) {
        const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

        if (systemInstructions) {
          span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE, systemInstructions);
        }

        const filteredLength = Array.isArray(filteredMessages) ? filteredMessages.length : 0;
        span.setAttributes({
          [AI_PROMPT_MESSAGES_ATTRIBUTE]: undefined,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: getTruncatedJsonString(filteredMessages),
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: filteredLength,
        });
      }
      // eslint-disable-next-line no-empty
    } catch {}
  }
}

/**
 * Maps a Vercel AI span name to the corresponding Sentry op.
 */
export function getSpanOpFromName(name: string): string | undefined {
  switch (name) {
    case 'ai.generateText':
    case 'ai.streamText':
    case 'ai.generateObject':
    case 'ai.streamObject':
    case 'ai.embed':
    case 'ai.embedMany':
      return GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE;
    case 'ai.generateText.doGenerate':
      return GEN_AI_GENERATE_TEXT_DO_GENERATE_OPERATION_ATTRIBUTE;
    case 'ai.streamText.doStream':
      return GEN_AI_STREAM_TEXT_DO_STREAM_OPERATION_ATTRIBUTE;
    case 'ai.generateObject.doGenerate':
      return GEN_AI_GENERATE_OBJECT_DO_GENERATE_OPERATION_ATTRIBUTE;
    case 'ai.streamObject.doStream':
      return GEN_AI_STREAM_OBJECT_DO_STREAM_OPERATION_ATTRIBUTE;
    case 'ai.embed.doEmbed':
      return GEN_AI_EMBED_DO_EMBED_OPERATION_ATTRIBUTE;
    case 'ai.embedMany.doEmbed':
      return GEN_AI_EMBED_MANY_DO_EMBED_OPERATION_ATTRIBUTE;
    case 'ai.toolCall':
      return GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE;
    default:
      if (name.startsWith('ai.stream')) {
        return 'ai.run';
      }
      return undefined;
  }
}
