import type { Span } from '../..';
import { type SpanAttributeValue, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../..';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { LANGCHAIN_ORIGIN } from './constants';
import type { LangChainLLMResult, LangChainMessage, LangChainSerializedLLM } from './types';

/**
 * Extract invocation params from tags object
 * LangChain passes runtime parameters in the tags object
 */
export function getInvocationParams(tags?: string[] | Record<string, unknown>): Record<string, unknown> | undefined {
  if (!tags || Array.isArray(tags)) {
    return undefined;
  }
  return tags.invocation_params as Record<string, unknown> | undefined;
}

/**
 * Normalize a single message role to standard gen_ai format
 */
export function normalizeMessageRole(role: string): string {
  const roleMap: Record<string, string> = {
    human: 'user',
    ai: 'assistant',
    system: 'system',
    function: 'function',
    tool: 'tool',
  };

  const normalizedRole = role.toLowerCase();
  return roleMap[normalizedRole] || normalizedRole;
}

/**
 * Extract role from constructor name
 */
export function normalizeRoleName(roleName: string): string {
  if (roleName.includes('System')) {
    return 'system';
  }
  if (roleName.includes('Human')) {
    return 'user';
  }
  if (roleName.includes('AI') || roleName.includes('Assistant')) {
    return 'assistant';
  }
  if (roleName.includes('Function')) {
    return 'function';
  }
  if (roleName.includes('Tool')) {
    return 'tool';
  }
  return 'user';
}

/**
 * Normalize LangChain messages to simple {role, content} format
 * Handles both raw message objects and serialized LangChain message format
 */
export function normalizeLangChainMessages(messages: LangChainMessage[]): Array<{ role: string; content: string }> {
  return messages.map(message => {
    // First, try to get the message type from _getType() method (most reliable)
    if (typeof (message as { _getType?: () => string })._getType === 'function') {
      const messageType = (message as { _getType: () => string })._getType();
      return {
        role: normalizeMessageRole(messageType),
        content: String((message as { content?: string }).content || ''),
      };
    }

    // Check constructor name (for LangChain message objects like SystemMessage, HumanMessage, etc.)
    const constructorName = message.constructor?.name;
    if (constructorName) {
      const role = normalizeRoleName(constructorName);
      return {
        role: normalizeMessageRole(role),
        content: String((message as { content?: string }).content || ''),
      };
    }

    // Handle message objects with type field
    if (message.type) {
      const role = String(message.type).toLowerCase();
      return {
        role: normalizeMessageRole(role),
        content: String(message.content || ''),
      };
    }

    // Handle regular message objects with role and content
    if (message.role && message.content) {
      return {
        role: normalizeMessageRole(String(message.role)),
        content: String(message.content),
      };
    }

    // Handle LangChain serialized format with lc: 1
    if (message.lc === 1 && message.kwargs) {
      // Extract role from the message type (e.g., HumanMessage -> user)
      const messageType = Array.isArray(message.id) && message.id.length > 0 ? message.id[message.id.length - 1] : '';
      const role = typeof messageType === 'string' ? normalizeRoleName(messageType) : 'user';

      return {
        role: normalizeMessageRole(role),
        content: String(message.kwargs.content || ''),
      };
    }

    // Fallback: return as-is if we can't normalize
    return {
      role: 'user',
      content: String(message.content || JSON.stringify(message)),
    };
  });
}

/**
 * Extract common request attributes shared by LLM and chat model requests
 */
export function extractCommonRequestAttributes(
  serialized: LangChainSerializedLLM,
  invocationParams?: Record<string, unknown>,
  langSmithMetadata?: Record<string, unknown>,
): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {};

  // Priority: invocationParams > LangSmith > kwargs
  const temperature =
    invocationParams?.temperature ?? langSmithMetadata?.ls_temperature ?? serialized.kwargs?.temperature;
  if (Number(temperature)) {
    attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = Number(temperature);
  }

  const maxTokens = invocationParams?.max_tokens ?? langSmithMetadata?.ls_max_tokens ?? serialized.kwargs?.max_tokens;
  if (Number(maxTokens)) {
    attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE] = Number(maxTokens);
  }

  const topP = invocationParams?.top_p ?? serialized.kwargs?.top_p;
  if (Number(topP)) {
    attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = Number(topP);
  }

  const frequencyPenalty = invocationParams?.frequency_penalty ?? serialized.kwargs?.frequency_penalty;
  if (Number(frequencyPenalty)) {
    attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = Number(frequencyPenalty);
  }

  const presencePenalty = invocationParams?.presence_penalty ?? serialized.kwargs?.presence_penalty;
  if (Number(presencePenalty)) {
    attributes[GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = Number(presencePenalty);
  }

  const streaming = invocationParams?.stream;
  if (streaming !== undefined && streaming !== null) {
    // Sometimes this is set to false even for stream requests
    // This issue stems from LangChain's callback handler and should be investigated
    attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = Boolean(streaming);
  }

  return attributes;
}

/**
 * Extract request attributes from LLM start event
 */
export function extractLLMRequestAttributes(
  serialized: LangChainSerializedLLM,
  prompts: string[],
  recordInputs: boolean,
  invocationParams?: Record<string, unknown>,
  langSmithMetadata?: Record<string, unknown>,
): Record<string, SpanAttributeValue> {
  const system = JSON.stringify(langSmithMetadata?.ls_provider);
  const modelName = JSON.stringify(invocationParams?.model ?? langSmithMetadata?.ls_model_name ?? 'unknown');

  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: system,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'pipeline',
    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: modelName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
    ...extractCommonRequestAttributes(serialized, invocationParams, langSmithMetadata),
  };

  // Add prompts if recordInputs is enabled
  if (recordInputs && prompts && prompts.length > 0) {
    // Convert string prompts to message format
    const messages = prompts.map(prompt => ({ role: 'user', content: prompt }));
    attributes[GEN_AI_REQUEST_MESSAGES_ATTRIBUTE] = JSON.stringify(messages);
  }

  return attributes;
}

/**
 * Extract request attributes from chat model start event
 */
export function extractChatModelRequestAttributes(
  serialized: LangChainSerializedLLM,
  messages: LangChainMessage[][],
  recordInputs: boolean,
  invocationParams?: Record<string, unknown>,
  langSmithMetadata?: Record<string, unknown>,
): Record<string, SpanAttributeValue> {
  // Provider either exists in LangSmith metadata or is the 3rd index of the id array of the serialized LLM
  const system = JSON.stringify(langSmithMetadata?.ls_provider ?? serialized.id?.[2]);
  const modelName = JSON.stringify(invocationParams?.model ?? langSmithMetadata?.ls_model_name ?? 'unknown');

  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: system,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'chat',
    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: modelName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
    ...extractCommonRequestAttributes(serialized, invocationParams, langSmithMetadata),
  };

  // Add messages if recordInputs is enabled
  if (recordInputs && messages && messages.length > 0) {
    // Flatten the messages array (LangChain passes array of message arrays)
    const flatMessages = messages.flat();
    // Normalize messages to extract content from LangChain serialized format
    const normalizedMessages = normalizeLangChainMessages(flatMessages);
    attributes[GEN_AI_REQUEST_MESSAGES_ATTRIBUTE] = JSON.stringify(normalizedMessages);
  }

  return attributes;
}

/**
 * Extract tool calls attributes from generations
 */
export function extractToolCallsAttributes(generations: LangChainMessage[][], span: Span): void {
  const toolCalls: Array<unknown> = [];

  // Flatten the generations array (LangChain returns [[generation]])
  const flatGenerations = generations.flat();

  for (const gen of flatGenerations) {
    // Check if message has a content array (Anthropic format)
    if (gen.message?.content && Array.isArray(gen.message.content)) {
      for (const contentItem of gen.message.content) {
        const typedContent = contentItem as { type?: string; id?: string; name?: string; input?: unknown };
        if (typedContent.type === 'tool_use') {
          toolCalls.push(typedContent);
        }
      }
    }
  }

  if (toolCalls.length > 0) {
    span.setAttributes({
      [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(toolCalls),
    });
  }
}

/**
 * Extract token usage attributes from LLM output
 */
export function extractTokenUsageAttributes(llmOutput: LangChainLLMResult['llmOutput'], span: Span): void {
  if (!llmOutput) return;
  // Try standard tokenUsage format (OpenAI)
  const tokenUsage = llmOutput.tokenUsage as
    | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    | undefined;
  // Try Anthropic format (usage.input_tokens, etc.)
  const anthropicUsage = llmOutput.usage as
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      }
    | undefined;

  if (tokenUsage) {
    if (Number(tokenUsage.promptTokens)) {
      span.setAttributes({ [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: tokenUsage.promptTokens });
    }
    if (Number(tokenUsage.completionTokens)) {
      span.setAttributes({ [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: tokenUsage.completionTokens });
    }
    if (Number(tokenUsage.totalTokens)) {
      span.setAttributes({ [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: tokenUsage.totalTokens });
    }
  } else if (anthropicUsage) {
    // Handle Anthropic format
    if (Number(anthropicUsage.input_tokens)) {
      span.setAttributes({ [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: anthropicUsage.input_tokens });
    }
    if (Number(anthropicUsage.output_tokens)) {
      span.setAttributes({ [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: anthropicUsage.output_tokens });
    }
    // Calculate total tokens for Anthropic
    const total = (anthropicUsage.input_tokens || 0) + (anthropicUsage.output_tokens || 0);
    if (total > 0) {
      span.setAttributes({ [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: total });
    }
    // Add cache tokens if present
    if (anthropicUsage.cache_creation_input_tokens !== undefined) {
      span.setAttributes({ 'gen_ai.usage.cache_creation_input_tokens': anthropicUsage.cache_creation_input_tokens });
    }
    if (anthropicUsage.cache_read_input_tokens !== undefined) {
      span.setAttributes({ 'gen_ai.usage.cache_read_input_tokens': anthropicUsage.cache_read_input_tokens });
    }
  }
}

/**
 * Add response attributes from LLM result
 */
export function addLLMResponseAttributes(span: Span, response: LangChainLLMResult, recordOutputs: boolean): void {
  if (!response) return;

  // Extract finish reasons
  if (response.generations && Array.isArray(response.generations)) {
    const finishReasons = response.generations
      .map(gen => gen.generation_info?.finish_reason)
      .filter(reason => typeof reason === 'string');

    if (finishReasons.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(finishReasons),
      });
    }

    // Extract response text if recordOutputs is enabled
    if (recordOutputs) {
      const responseTexts = response.generations
        .flat()
        .map(gen => gen.text || gen.message?.content)
        .filter(text => typeof text === 'string');

      if (responseTexts.length > 0) {
        span.setAttributes({
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify(responseTexts),
        });
      }

      // Extract tool calls from message content if present
      extractToolCallsAttributes(response.generations as LangChainMessage[][], span);
    }
  }

  // Extract token usage - handle both formats (OpenAI and Anthropic)
  extractTokenUsageAttributes(response.llmOutput, span);

  // Extract model name from response (handle both model_name and model fields)
  const modelName = response.llmOutput?.model_name || response.llmOutput?.model;

  if (modelName) {
    span.setAttributes({ [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: JSON.stringify(modelName) });
  }

  // Add response ID (useful for debugging/correlation)
  if (response.llmOutput?.id) {
    span.setAttributes({ 'gen_ai.response.id': JSON.stringify(response.llmOutput.id) });
  }

  // Add stop reason as finish reason if not already captured
  if (response.llmOutput?.stop_reason) {
    span.setAttributes({ 'gen_ai.response.stop_reason': JSON.stringify(response.llmOutput.stop_reason) });
  }
}
