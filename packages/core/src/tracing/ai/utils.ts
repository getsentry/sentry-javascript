/**
 * Shared utils for AI integrations (OpenAI, Anthropic, Verce.AI, etc.)
 */
import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from './gen-ai-attributes';
import { truncateGenAiMessages, truncateGenAiStringInput } from './messageTruncation';
/**
 * Maps AI method paths to OpenTelemetry semantic convention operation names
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/#llm-request-spans
 */
export function getFinalOperationName(methodPath: string): string {
  if (methodPath.includes('messages')) {
    return 'chat';
  }
  if (methodPath.includes('completions')) {
    return 'text_completion';
  }
  // Google GenAI: models.generateContent* -> generate_content (actually generates AI responses)
  if (methodPath.includes('generateContent')) {
    return 'generate_content';
  }
  // Anthropic: models.get/retrieve -> models (metadata retrieval only)
  if (methodPath.includes('models')) {
    return 'models';
  }
  if (methodPath.includes('chat')) {
    return 'chat';
  }
  return methodPath.split('.').pop() || 'unknown';
}

/**
 * Get the span operation for AI methods
 * Following Sentry's convention: "gen_ai.{operation_name}"
 */
export function getSpanOperation(methodPath: string): string {
  return `gen_ai.${getFinalOperationName(methodPath)}`;
}

/**
 * Build method path from current traversal
 */
export function buildMethodPath(currentPath: string, prop: string): string {
  return currentPath ? `${currentPath}.${prop}` : prop;
}

/**
 * Set token usage attributes
 * @param span - The span to add attributes to
 * @param promptTokens - The number of prompt tokens
 * @param completionTokens - The number of completion tokens
 * @param cachedInputTokens - The number of cached input tokens
 * @param cachedOutputTokens - The number of cached output tokens
 */
export function setTokenUsageAttributes(
  span: Span,
  promptTokens?: number,
  completionTokens?: number,
  cachedInputTokens?: number,
  cachedOutputTokens?: number,
): void {
  if (promptTokens !== undefined) {
    span.setAttributes({
      [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: promptTokens,
    });
  }
  if (completionTokens !== undefined) {
    span.setAttributes({
      [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: completionTokens,
    });
  }
  if (
    promptTokens !== undefined ||
    completionTokens !== undefined ||
    cachedInputTokens !== undefined ||
    cachedOutputTokens !== undefined
  ) {
    /**
     * Total input tokens in a request is the summation of `input_tokens`,
     * `cache_creation_input_tokens`, and `cache_read_input_tokens`.
     */
    const totalTokens =
      (promptTokens ?? 0) + (completionTokens ?? 0) + (cachedInputTokens ?? 0) + (cachedOutputTokens ?? 0);

    span.setAttributes({
      [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: totalTokens,
    });
  }
}

/**
 * Get the truncated JSON string for a string or array of strings.
 *
 * @param value - The string or array of strings to truncate
 * @returns The truncated JSON string
 */
export function getTruncatedJsonString<T>(value: T | T[]): string {
  if (typeof value === 'string') {
    // Some values are already JSON strings, so we don't need to duplicate the JSON parsing
    return truncateGenAiStringInput(value);
  }
  if (Array.isArray(value)) {
    // truncateGenAiMessages returns an array of strings, so we need to stringify it
    const truncatedMessages = truncateGenAiMessages(value);
    return JSON.stringify(truncatedMessages);
  }
  // value is an object, so we need to stringify it
  return JSON.stringify(value);
}

/**
 * Extract system instructions from messages array.
 * Finds the first system message and formats it according to OpenTelemetry semantic conventions.
 *
 * @param messages - Array of messages to extract system instructions from
 * @returns systemInstructions (JSON string) and filteredMessages (without system message)
 */
export function extractSystemInstructions(messages: unknown[] | unknown): {
  systemInstructions: string | undefined;
  filteredMessages: unknown[] | unknown;
} {
  if (!Array.isArray(messages)) {
    return { systemInstructions: undefined, filteredMessages: messages };
  }

  const systemMessageIndex = messages.findIndex(
    msg => msg && typeof msg === 'object' && 'role' in msg && (msg as { role: string }).role === 'system',
  );

  if (systemMessageIndex === -1) {
    return { systemInstructions: undefined, filteredMessages: messages };
  }

  const systemMessage = messages[systemMessageIndex] as { role: string; content?: string | unknown };
  const systemContent =
    typeof systemMessage.content === 'string'
      ? systemMessage.content
      : systemMessage.content !== undefined
        ? JSON.stringify(systemMessage.content)
        : undefined;

  if (!systemContent) {
    return { systemInstructions: undefined, filteredMessages: messages };
  }

  const systemInstructions = JSON.stringify([{ type: 'text', content: systemContent }]);
  const filteredMessages = [...messages.slice(0, systemMessageIndex), ...messages.slice(systemMessageIndex + 1)];

  return { systemInstructions, filteredMessages };
}
