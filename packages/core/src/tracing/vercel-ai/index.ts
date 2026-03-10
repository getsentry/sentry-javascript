/* eslint-disable max-lines */
import type { Client } from '../../client';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import type { Event } from '../../types-hoist/event';
import type { Span, SpanAttributes, SpanAttributeValue, SpanJSON } from '../../types-hoist/span';
import { spanToJSON } from '../../utils/spanUtils';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import {
  DO_SPAN_NAME_PREFIX,
  EMBEDDINGS_OPS,
  GENERATE_CONTENT_OPS,
  INVOKE_AGENT_OPS,
  RERANK_OPS,
  toolCallSpanContextMap,
} from './constants';
import type { TokenSummary } from './types';
import {
  accumulateTokensForParent,
  applyAccumulatedTokens,
  convertAvailableToolsToJsonString,
  getSpanOpFromName,
  requestMessagesFromPrompt,
} from './utils';
import type { OpenAiProviderMetadata, ProviderMetadata } from './vercel-ai-attributes';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_OPERATION_ID_ATTRIBUTE,
  AI_PROMPT_MESSAGES_ATTRIBUTE,
  AI_PROMPT_TOOLS_ATTRIBUTE,
  AI_RESPONSE_FINISH_REASON_ATTRIBUTE,
  AI_RESPONSE_OBJECT_ATTRIBUTE,
  AI_RESPONSE_PROVIDER_METADATA_ATTRIBUTE,
  AI_RESPONSE_TEXT_ATTRIBUTE,
  AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  AI_SCHEMA_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TOOL_CALL_ARGS_ATTRIBUTE,
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
  AI_TOOL_CALL_RESULT_ATTRIBUTE,
  AI_USAGE_CACHED_INPUT_TOKENS_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  OPERATION_NAME_ATTRIBUTE,
} from './vercel-ai-attributes';

/**
 * Maps Vercel AI SDK operation names to OpenTelemetry semantic convention values
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/#llm-request-spans
 */
function mapVercelAiOperationName(operationName: string): string {
  // Top-level pipeline operations map to invoke_agent
  if (INVOKE_AGENT_OPS.has(operationName)) {
    return 'invoke_agent';
  }
  // .do* operations are the actual LLM calls
  if (GENERATE_CONTENT_OPS.has(operationName)) {
    return 'generate_content';
  }
  if (EMBEDDINGS_OPS.has(operationName)) {
    return 'embeddings';
  }
  if (RERANK_OPS.has(operationName)) {
    return 'rerank';
  }
  if (operationName === 'ai.toolCall') {
    return 'execute_tool';
  }
  // Return the original value for unknown operations
  return operationName;
}

/**
 * Post-process spans emitted by the Vercel AI SDK.
 * This is supposed to be used in `client.on('spanStart', ...)
 */
function onVercelAiSpanStart(span: Span): void {
  const { data: attributes, description: name } = spanToJSON(span);

  if (!name) {
    return;
  }

  // Tool call spans
  // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
  if (attributes[AI_TOOL_CALL_NAME_ATTRIBUTE] && attributes[AI_TOOL_CALL_ID_ATTRIBUTE] && name === 'ai.toolCall') {
    processToolCallSpan(span, attributes);
    return;
  }

  // V6+ Check if this is a Vercel AI span by checking if the operation ID attribute is present.
  // V5+ Check if this is a Vercel AI span by name pattern.
  if (!attributes[AI_OPERATION_ID_ATTRIBUTE] && !name.startsWith('ai.')) {
    return;
  }

  processGenerateSpan(span, name, attributes);
}

function vercelAiEventProcessor(event: Event): Event {
  if (event.type === 'transaction' && event.spans) {
    // Map to accumulate token data by parent span ID
    const tokenAccumulator: Map<string, TokenSummary> = new Map();

    // First pass: process all spans and accumulate token data
    for (const span of event.spans) {
      processEndedVercelAiSpan(span);

      // Accumulate token data for parent spans
      accumulateTokensForParent(span, tokenAccumulator);
    }

    // Second pass: apply tool descriptions and accumulated tokens
    for (const span of event.spans) {
      if (span.op === 'gen_ai.execute_tool') {
        const toolName = span.data[GEN_AI_TOOL_NAME_ATTRIBUTE];
        if (typeof toolName === 'string') {
          const description = findToolDescription(event.spans, toolName);
          if (description) {
            span.data[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE] = description;
          }
        }
      }

      if (span.op === 'gen_ai.invoke_agent') {
        applyAccumulatedTokens(span, tokenAccumulator);
      }
    }

    // Also apply to root when it is the invoke_agent pipeline
    const trace = event.contexts?.trace;
    if (trace && trace.op === 'gen_ai.invoke_agent') {
      applyAccumulatedTokens(trace, tokenAccumulator);
    }
  }

  return event;
}

/**
 * Finds a tool description by scanning spans for gen_ai.request.available_tools
 * (already processed from ai.prompt.tools in the first pass).
 */
function findToolDescription(spans: SpanJSON[], toolName: string): string | undefined {
  for (const span of spans) {
    const availableTools = span.data[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE];
    if (typeof availableTools !== 'string') {
      continue;
    }
    try {
      const tools = JSON.parse(availableTools) as Array<{ name?: string; description?: string }>;
      const tool = tools.find(t => t.name === toolName);
      if (tool?.description) {
        return tool.description;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

/**
 * Tool call structure from Vercel AI SDK
 * Note: Vercel AI uses 'input' for arguments in ai.response.toolCalls
 */
interface VercelToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Build gen_ai.output.messages from ai.response.text and/or ai.response.toolCalls
 *
 * Format follows OpenTelemetry semantic conventions:
 * [{"role": "assistant", "parts": [...], "finish_reason": "stop"}]
 *
 * Parts can be:
 * - {"type": "text", "content": "..."}
 * - {"type": "tool_call", "id": "...", "name": "...", "arguments": "..."}
 */
function buildOutputMessages(attributes: Record<string, unknown>): void {
  const responseText = attributes[AI_RESPONSE_TEXT_ATTRIBUTE];
  const responseToolCalls = attributes[AI_RESPONSE_TOOL_CALLS_ATTRIBUTE];
  const finishReason = attributes[AI_RESPONSE_FINISH_REASON_ATTRIBUTE];

  // Skip if neither text nor tool calls are present
  if (responseText == null && responseToolCalls == null) {
    return;
  }

  const parts: Array<Record<string, unknown>> = [];

  // Add text part if present
  if (typeof responseText === 'string' && responseText.length > 0) {
    parts.push({
      type: 'text',
      content: responseText,
    });
  }

  // Add tool call parts if present
  if (responseToolCalls != null) {
    try {
      // Tool calls can be a string (JSON) or already parsed array
      const toolCalls: VercelToolCall[] =
        typeof responseToolCalls === 'string' ? JSON.parse(responseToolCalls) : responseToolCalls;

      if (Array.isArray(toolCalls)) {
        for (const toolCall of toolCalls) {
          // Vercel AI SDK uses 'input' for tool call arguments
          const args = toolCall.input;
          parts.push({
            type: 'tool_call',
            id: toolCall.toolCallId,
            name: toolCall.toolName,
            arguments: typeof args === 'string' ? args : JSON.stringify(args),
          });
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Only set if we have parts
  if (parts.length > 0) {
    const outputMessage = {
      role: 'assistant',
      parts,
      finish_reason: typeof finishReason === 'string' ? finishReason : 'stop',
    };

    attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE] = JSON.stringify([outputMessage]);
  }
}

/**
 * Post-process spans emitted by the Vercel AI SDK.
 */
function processEndedVercelAiSpan(span: SpanJSON): void {
  const { data: attributes, origin } = span;

  if (origin !== 'auto.vercelai.otel') {
    return;
  }

  renameAttributeKey(attributes, AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE, GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, AI_USAGE_PROMPT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, AI_USAGE_CACHED_INPUT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE);

  // Parent spans (ai.streamText, ai.streamObject, etc.) use inputTokens/outputTokens instead of promptTokens/completionTokens
  renameAttributeKey(attributes, 'ai.usage.inputTokens', GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.usage.outputTokens', GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);

  // AI SDK uses avgOutputTokensPerSecond, map to our expected attribute name
  renameAttributeKey(attributes, 'ai.response.avgOutputTokensPerSecond', 'ai.response.avgCompletionTokensPerSecond');

  // Input tokens is the sum of prompt tokens and cached input tokens
  if (
    typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number' &&
    typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE] === 'number'
  ) {
    attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] =
      attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE];
  }

  if (
    typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
    typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
  ) {
    attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE] =
      attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
  }

  // Convert the available tools array to a JSON string
  if (attributes[AI_PROMPT_TOOLS_ATTRIBUTE] && Array.isArray(attributes[AI_PROMPT_TOOLS_ATTRIBUTE])) {
    attributes[AI_PROMPT_TOOLS_ATTRIBUTE] = convertAvailableToolsToJsonString(
      attributes[AI_PROMPT_TOOLS_ATTRIBUTE] as unknown[],
    );
  }

  // Rename AI SDK attributes to standardized gen_ai attributes
  // Map operation.name to OpenTelemetry semantic convention values
  if (attributes[OPERATION_NAME_ATTRIBUTE]) {
    const operationName = mapVercelAiOperationName(attributes[OPERATION_NAME_ATTRIBUTE] as string);
    attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE] = operationName;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete attributes[OPERATION_NAME_ATTRIBUTE];
  }
  renameAttributeKey(attributes, AI_PROMPT_MESSAGES_ATTRIBUTE, GEN_AI_INPUT_MESSAGES_ATTRIBUTE);

  // Build gen_ai.output.messages from response text and/or tool calls
  buildOutputMessages(attributes);

  // Remove the source attributes since they're now captured in gen_ai.output.messages
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete attributes[AI_RESPONSE_TEXT_ATTRIBUTE];
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete attributes[AI_RESPONSE_TOOL_CALLS_ATTRIBUTE];

  renameAttributeKey(attributes, AI_RESPONSE_OBJECT_ATTRIBUTE, 'gen_ai.response.object');
  renameAttributeKey(attributes, AI_PROMPT_TOOLS_ATTRIBUTE, 'gen_ai.request.available_tools');

  renameAttributeKey(attributes, AI_TOOL_CALL_ARGS_ATTRIBUTE, GEN_AI_TOOL_INPUT_ATTRIBUTE);
  renameAttributeKey(attributes, AI_TOOL_CALL_RESULT_ATTRIBUTE, GEN_AI_TOOL_OUTPUT_ATTRIBUTE);

  renameAttributeKey(attributes, AI_SCHEMA_ATTRIBUTE, 'gen_ai.request.schema');
  renameAttributeKey(attributes, AI_MODEL_ID_ATTRIBUTE, GEN_AI_REQUEST_MODEL_ATTRIBUTE);

  addProviderMetadataToAttributes(attributes);

  // Change attributes namespaced with `ai.X` to `vercel.ai.X`
  for (const key of Object.keys(attributes)) {
    if (key.startsWith('ai.')) {
      renameAttributeKey(attributes, key, `vercel.${key}`);
    }
  }
}

/**
 * Renames an attribute key in the provided attributes object if the old key exists.
 * This function safely handles null and undefined values.
 */
function renameAttributeKey(attributes: Record<string, unknown>, oldKey: string, newKey: string): void {
  if (attributes[oldKey] != null) {
    attributes[newKey] = attributes[oldKey];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete attributes[oldKey];
  }
}

function processToolCallSpan(span: Span, attributes: SpanAttributes): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.vercelai.otel');
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.execute_tool');
  span.setAttribute(GEN_AI_OPERATION_NAME_ATTRIBUTE, 'execute_tool');
  renameAttributeKey(attributes, AI_TOOL_CALL_NAME_ATTRIBUTE, GEN_AI_TOOL_NAME_ATTRIBUTE);
  renameAttributeKey(attributes, AI_TOOL_CALL_ID_ATTRIBUTE, GEN_AI_TOOL_CALL_ID_ATTRIBUTE);

  // Store the span context in our global map using the tool call ID.
  // This allows us to capture tool errors and link them to the correct span
  // without retaining the full Span object in memory.
  const toolCallId = attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE];

  if (typeof toolCallId === 'string') {
    toolCallSpanContextMap.set(toolCallId, span.spanContext());
  }

  // https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-type
  if (!attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_TOOL_TYPE_ATTRIBUTE, 'function');
  }
  const toolName = attributes[GEN_AI_TOOL_NAME_ATTRIBUTE];
  if (toolName) {
    span.updateName(`execute_tool ${toolName}`);
  }
}

function processGenerateSpan(span: Span, name: string, attributes: SpanAttributes): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.vercelai.otel');

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute('ai.pipeline.name', nameWthoutAi);
  span.updateName(nameWthoutAi);

  const functionId = attributes[AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
  if (functionId && typeof functionId === 'string') {
    span.setAttribute('gen_ai.function_id', functionId);
  }

  requestMessagesFromPrompt(span, attributes);

  if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
  }
  span.setAttribute('ai.streaming', name.includes('stream'));

  // Set the op based on the span name
  const op = getSpanOpFromName(name);
  if (op) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, op);
  }

  // For invoke_agent pipeline spans, use 'invoke_agent' as the description
  // to be consistent with other AI integrations (e.g. LangGraph)
  if (INVOKE_AGENT_OPS.has(name)) {
    if (functionId && typeof functionId === 'string') {
      span.updateName(`invoke_agent ${functionId}`);
    } else {
      span.updateName('invoke_agent');
    }
    return;
  }

  const modelId = attributes[AI_MODEL_ID_ATTRIBUTE];
  if (modelId) {
    const doSpanPrefix = GENERATE_CONTENT_OPS.has(name) ? 'generate_content' : DO_SPAN_NAME_PREFIX[name];
    if (doSpanPrefix) {
      span.updateName(`${doSpanPrefix} ${modelId}`);
    }
  }
}

/**
 * Add event processors to the given client to process Vercel AI spans.
 */
export function addVercelAiProcessors(client: Client): void {
  client.on('spanStart', onVercelAiSpanStart);
  // Note: We cannot do this on `spanEnd`, because the span cannot be mutated anymore at this point
  client.addEventProcessor(Object.assign(vercelAiEventProcessor, { id: 'VercelAiEventProcessor' }));
}

function addProviderMetadataToAttributes(attributes: SpanAttributes): void {
  const providerMetadata = attributes[AI_RESPONSE_PROVIDER_METADATA_ATTRIBUTE] as string | undefined;
  if (providerMetadata) {
    try {
      const providerMetadataObject = JSON.parse(providerMetadata) as ProviderMetadata;

      // Handle OpenAI metadata (v5 uses 'openai', v6 Azure Responses API uses 'azure')
      const openaiMetadata: OpenAiProviderMetadata | undefined =
        providerMetadataObject.openai ?? providerMetadataObject.azure;
      if (openaiMetadata) {
        setAttributeIfDefined(
          attributes,
          GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
          openaiMetadata.cachedPromptTokens,
        );
        setAttributeIfDefined(attributes, 'gen_ai.usage.output_tokens.reasoning', openaiMetadata.reasoningTokens);
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.prediction_accepted',
          openaiMetadata.acceptedPredictionTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.prediction_rejected',
          openaiMetadata.rejectedPredictionTokens,
        );
        setAttributeIfDefined(attributes, 'gen_ai.conversation.id', openaiMetadata.responseId);
      }

      if (providerMetadataObject.anthropic) {
        const cachedInputTokens =
          providerMetadataObject.anthropic.usage?.cache_read_input_tokens ??
          providerMetadataObject.anthropic.cacheReadInputTokens;
        setAttributeIfDefined(attributes, GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE, cachedInputTokens);

        const cacheWriteInputTokens =
          providerMetadataObject.anthropic.usage?.cache_creation_input_tokens ??
          providerMetadataObject.anthropic.cacheCreationInputTokens;
        setAttributeIfDefined(attributes, GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE, cacheWriteInputTokens);
      }

      if (providerMetadataObject.bedrock?.usage) {
        setAttributeIfDefined(
          attributes,
          GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
          providerMetadataObject.bedrock.usage.cacheReadInputTokens,
        );
        setAttributeIfDefined(
          attributes,
          GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE,
          providerMetadataObject.bedrock.usage.cacheWriteInputTokens,
        );
      }

      if (providerMetadataObject.deepseek) {
        setAttributeIfDefined(
          attributes,
          GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
          providerMetadataObject.deepseek.promptCacheHitTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cache_miss',
          providerMetadataObject.deepseek.promptCacheMissTokens,
        );
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Sets an attribute only if the value is not null or undefined.
 */
function setAttributeIfDefined(attributes: SpanAttributes, key: string, value: SpanAttributeValue | undefined): void {
  if (value != null) {
    attributes[key] = value;
  }
}
