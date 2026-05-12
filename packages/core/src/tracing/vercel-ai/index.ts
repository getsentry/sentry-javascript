/* eslint-disable max-lines */
import type { Client } from '../../client';
import { getClient } from '../../currentScopes';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { shouldEnableTruncation } from '../ai/utils';
import type { Event } from '../../types-hoist/event';
import type { Span, SpanAttributes, SpanAttributeValue, SpanJSON, StreamedSpanJSON } from '../../types-hoist/span';
import { spanToJSON } from '../../utils/spanUtils';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
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
import { SPAN_TO_OPERATION_NAME, toolCallSpanContextMap, toolDescriptionMap } from './constants';
import type { TokenSummary } from './types';
import { hasSpanStreamingEnabled } from '../spans/hasSpanStreamingEnabled';
import {
  accumulateTokensForParent,
  applyAccumulatedTokens,
  applyToolDescriptionsAndTokens,
  convertAvailableToolsToJsonString,
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
  AI_USAGE_TOKENS_ATTRIBUTE,
  AI_VALUES_ATTRIBUTE,
  OPERATION_NAME_ATTRIBUTE,
} from './vercel-ai-attributes';

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

  const client = getClient();
  const integration = client?.getIntegrationByName('VercelAI') as
    | { options?: { enableTruncation?: boolean } }
    | undefined;
  const enableTruncation = shouldEnableTruncation(integration?.options?.enableTruncation);

  processGenerateSpan(span, name, attributes, enableTruncation);
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
    applyToolDescriptionsAndTokens(event.spans, tokenAccumulator);

    // Also apply to root when it is the invoke_agent pipeline
    const trace = event.contexts?.trace;
    if (trace?.op === 'gen_ai.invoke_agent') {
      applyAccumulatedTokens(trace, tokenAccumulator);
    }
  }

  return event;
}

/**
 * Tool call structure from Vercel AI SDK
 * Note: V5/V6 use 'input' for arguments, V4 and earlier use 'args'
 */
interface VercelToolCall {
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown> | string; // V5/V6
  args?: string; // V4 and earlier
}

/**
 * Normalize finish reason to match OpenTelemetry semantic conventions.
 * Valid values: "stop", "length", "content_filter", "tool_call", "error"
 *
 * Vercel AI SDK uses "tool-calls" (plural, with hyphen) which we map to "tool_call".
 */
function normalizeFinishReason(finishReason: unknown): string {
  if (typeof finishReason !== 'string') {
    return 'stop';
  }

  // Map Vercel AI SDK finish reasons to OpenTelemetry semantic convention values
  switch (finishReason) {
    case 'tool-calls':
      return 'tool_call';
    case 'stop':
    case 'length':
    case 'content_filter':
    case 'error':
      return finishReason;
    default:
      // For unknown values, return as-is (schema allows arbitrary strings)
      return finishReason;
  }
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
          // V5/V6 use 'input', V4 and earlier use 'args'
          const args = toolCall.input ?? toolCall.args;
          parts.push({
            type: 'tool_call',
            id: toolCall.toolCallId,
            name: toolCall.toolName,
            // Handle undefined args: JSON.stringify(undefined) returns undefined, not a string,
            // which would cause the property to be omitted from the final JSON output
            arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
          });
        }
        // Only delete tool calls attribute if we successfully processed them
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete attributes[AI_RESPONSE_TOOL_CALLS_ATTRIBUTE];
      }
    } catch {
      // Ignore parsing errors - tool calls attribute is preserved
    }
  }

  // Only set output messages and delete text attribute if we have parts
  if (parts.length > 0) {
    const outputMessage = {
      role: 'assistant',
      parts,
      finish_reason: normalizeFinishReason(finishReason),
    };

    attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE] = JSON.stringify([outputMessage]);

    // Remove the text attribute since it's now captured in gen_ai.output.messages
    // Note: tool calls attribute is deleted above only if successfully parsed
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete attributes[AI_RESPONSE_TEXT_ATTRIBUTE];
  }
}

/**
 * Post-process spans emitted by the Vercel AI SDK.
 */
/**
 * Rename and normalize Vercel AI SDK attributes to OpenTelemetry semantic conventions.
 * This is the shared attribute processing logic used by both the legacy event processor
 * path (SpanJSON) and the streamed span path (StreamedSpanJSON).
 */
export function processVercelAiSpanAttributes(attributes: Record<string, unknown>): void {
  renameAttributeKey(attributes, AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE, GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, AI_USAGE_PROMPT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, AI_USAGE_CACHED_INPUT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE);

  // Parent spans (ai.streamText, ai.streamObject, etc.) use inputTokens/outputTokens instead of promptTokens/completionTokens
  renameAttributeKey(attributes, 'ai.usage.inputTokens', GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.usage.outputTokens', GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);

  // Embedding spans use ai.usage.tokens instead of promptTokens/completionTokens
  renameAttributeKey(attributes, AI_USAGE_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);

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

  // Compute total tokens from input + output (embeddings may only have input tokens)
  if (typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number') {
    const outputTokens =
      typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number'
        ? attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]
        : 0;
    attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE] = outputTokens + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
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
    // V6+ sets ai.operationId to the bare operation (e.g. "ai.streamText") while
    // operation.name appends functionId (e.g. "ai.streamText myAgent").
    // When ai.operationId is present, use it for correct mapping.
    const rawOperationName = attributes[AI_OPERATION_ID_ATTRIBUTE]
      ? (attributes[AI_OPERATION_ID_ATTRIBUTE] as string)
      : (attributes[OPERATION_NAME_ATTRIBUTE] as string);
    const operationName = SPAN_TO_OPERATION_NAME.get(rawOperationName) ?? rawOperationName;
    attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE] = operationName;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete attributes[OPERATION_NAME_ATTRIBUTE];
  }
  renameAttributeKey(attributes, AI_PROMPT_MESSAGES_ATTRIBUTE, GEN_AI_INPUT_MESSAGES_ATTRIBUTE);

  // Build gen_ai.output.messages from response text and/or tool calls
  // Note: buildOutputMessages also removes the source attributes when output is successfully generated
  buildOutputMessages(attributes);

  renameAttributeKey(attributes, AI_RESPONSE_OBJECT_ATTRIBUTE, 'gen_ai.response.object');
  renameAttributeKey(attributes, AI_PROMPT_TOOLS_ATTRIBUTE, 'gen_ai.request.available_tools');

  renameAttributeKey(attributes, AI_TOOL_CALL_ARGS_ATTRIBUTE, GEN_AI_TOOL_INPUT_ATTRIBUTE);
  renameAttributeKey(attributes, AI_TOOL_CALL_RESULT_ATTRIBUTE, GEN_AI_TOOL_OUTPUT_ATTRIBUTE);

  renameAttributeKey(attributes, AI_SCHEMA_ATTRIBUTE, 'gen_ai.request.schema');
  renameAttributeKey(attributes, AI_MODEL_ID_ATTRIBUTE, GEN_AI_REQUEST_MODEL_ATTRIBUTE);

  // Map embedding input: ai.values → gen_ai.embeddings.input
  // Vercel AI SDK JSON-stringifies each value individually, so we parse each element back.
  // Single embed gets unwrapped to a plain value; batch embedMany stays as a JSON array.
  if (Array.isArray(attributes[AI_VALUES_ATTRIBUTE])) {
    const parsed = (attributes[AI_VALUES_ATTRIBUTE] as string[]).map(v => {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    });
    attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE] = parsed.length === 1 ? parsed[0] : JSON.stringify(parsed);
  }

  addProviderMetadataToAttributes(attributes);

  for (const key of Object.keys(attributes)) {
    // JSON-stringify any array-valued attributes so they survive v2 span serialization.
    // Can be removed once span streaming supports arrays natively.
    if (Array.isArray(attributes[key])) {
      attributes[key] = JSON.stringify(attributes[key]);
    }
    // Change attributes namespaced with `ai.X` to `vercel.ai.X`
    if (key.startsWith('ai.')) {
      renameAttributeKey(attributes, key, `vercel.${key}`);
    }
  }
}

function processEndedVercelAiSpan(span: SpanJSON): void {
  const { data: attributes, origin } = span;

  if (origin !== 'auto.vercelai.otel') {
    return;
  }

  // The Vercel AI SDK sets span status to raw error message strings.
  // Any such value should be normalized to a SpanStatusType value. We pick internal_error as it is the most generic.
  if (span.status && span.status !== 'ok') {
    span.status = 'internal_error';
  }

  processVercelAiSpanAttributes(attributes);
}

function processVercelAiStreamedSpan(span: StreamedSpanJSON): void {
  const attributes = span.attributes;
  if (attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] !== 'auto.vercelai.otel') {
    return;
  }

  processVercelAiSpanAttributes(attributes);

  // Look up tool description from the toolDescriptionMap for execute_tool spans
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'gen_ai.execute_tool' && span.parent_span_id) {
    const descriptions = toolDescriptionMap.get(span.parent_span_id);

    if (descriptions) {
      const toolName = attributes[GEN_AI_TOOL_NAME_ATTRIBUTE];
      if (typeof toolName === 'string') {
        const desc = descriptions.get(toolName);
        if (desc) {
          attributes[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE] = desc;
        }
      }
    }
  }

  // Clean up tool descriptions when the parent span ends
  toolDescriptionMap.delete(span.span_id);
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

function processGenerateSpan(span: Span, name: string, attributes: SpanAttributes, enableTruncation: boolean): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.vercelai.otel');

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute('ai.pipeline.name', nameWthoutAi);
  span.updateName(nameWthoutAi);

  const functionId = attributes[AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
  if (functionId && typeof functionId === 'string') {
    span.setAttribute('gen_ai.function_id', functionId);
  }

  requestMessagesFromPrompt(span, attributes, enableTruncation);

  if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
  }
  span.setAttribute('ai.streaming', name.includes('stream'));

  // Set the op based on the operation name registry
  const operationName = SPAN_TO_OPERATION_NAME.get(name);
  if (operationName) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, `gen_ai.${operationName}`);
  } else if (name.startsWith('ai.stream')) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
  }

  // For invoke_agent pipeline spans, use 'invoke_agent' as the description
  // to be consistent with other AI integrations (e.g. LangGraph)
  if (operationName === 'invoke_agent') {
    if (functionId && typeof functionId === 'string') {
      span.updateName(`invoke_agent ${functionId}`);
    } else {
      span.updateName('invoke_agent');
    }
    return;
  }

  const modelId = attributes[AI_MODEL_ID_ATTRIBUTE];
  if (modelId && operationName) {
    span.updateName(`${operationName} ${modelId}`);
  }

  // Store tool descriptions in the toolDescriptionMap so processSpan can apply them to execute_tool spans.
  // This is only needed for span streaming (transaction path handles this separately)
  const client = getClient();
  if (
    client &&
    hasSpanStreamingEnabled(client) &&
    attributes[AI_PROMPT_TOOLS_ATTRIBUTE] &&
    Array.isArray(attributes[AI_PROMPT_TOOLS_ATTRIBUTE])
  ) {
    const descriptions = new Map<string, string>();

    // parse tool names and descriptions from tool string array
    for (const toolStr of attributes[AI_PROMPT_TOOLS_ATTRIBUTE] as unknown[]) {
      try {
        const parsed = (typeof toolStr === 'string' ? JSON.parse(toolStr) : toolStr) as {
          name?: string;
          description?: string;
        };
        if (parsed?.name && parsed?.description) {
          descriptions.set(parsed.name, parsed.description);
        }
      } catch {
        // ignore parse errors
      }
    }
    if (descriptions.size > 0) {
      // Tool call spans are siblings of doGenerate (both children of invoke_agent),
      // so we key by the parent span ID (the invoke_agent span).
      const parentSpanId = spanToJSON(span).parent_span_id;
      if (parentSpanId) {
        toolDescriptionMap.set(parentSpanId, descriptions);
      }
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
  client.on('processSpan', span => {
    processVercelAiStreamedSpan(span);
  });
}

function addProviderMetadataToAttributes(attributes: Record<string, unknown>): void {
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
        if (!attributes['gen_ai.conversation.id']) {
          setAttributeIfDefined(attributes, 'gen_ai.conversation.id', openaiMetadata.responseId);
        }
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
function setAttributeIfDefined(
  attributes: Record<string, unknown>,
  key: string,
  value: SpanAttributeValue | undefined,
): void {
  if (value != null) {
    attributes[key] = value;
  }
}
