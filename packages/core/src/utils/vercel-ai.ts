import type { Client } from '../client';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { Event } from '../types-hoist/event';
import type { Span, SpanAttributes, SpanAttributeValue, SpanJSON, SpanOrigin } from '../types-hoist/span';
import { spanToJSON } from './spanUtils';
import type { ProviderMetadata } from './vercel-ai-attributes';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_PROMPT_ATTRIBUTE,
  AI_PROMPT_MESSAGES_ATTRIBUTE,
  AI_PROMPT_TOOLS_ATTRIBUTE,
  AI_RESPONSE_OBJECT_ATTRIBUTE,
  AI_RESPONSE_PROVIDER_METADATA_ATTRIBUTE,
  AI_RESPONSE_TEXT_ATTRIBUTE,
  AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TOOL_CALL_ARGS_ATTRIBUTE,
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
  AI_TOOL_CALL_RESULT_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from './vercel-ai-attributes';

function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
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

  // The AI and Provider must be defined for generate, stream, and embed spans.
  // The id of the model
  const aiModelId = attributes[AI_MODEL_ID_ATTRIBUTE];
  // the provider of the model
  const aiModelProvider = attributes[AI_MODEL_PROVIDER_ATTRIBUTE];
  if (typeof aiModelId !== 'string' || typeof aiModelProvider !== 'string' || !aiModelId || !aiModelProvider) {
    return;
  }

  processGenerateSpan(span, name, attributes);
}

interface TokenSummary {
  inputTokens: number;
  outputTokens: number;
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

    // Second pass: apply accumulated token data to parent spans
    for (const span of event.spans) {
      if (span.op !== 'gen_ai.invoke_agent') {
        continue;
      }

      applyAccumulatedTokens(span, tokenAccumulator);
    }
  }

  return event;
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

  if (
    typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
    typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
  ) {
    attributes['gen_ai.usage.total_tokens'] =
      attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
  }

  // Rename AI SDK attributes to standardized gen_ai attributes
  renameAttributeKey(attributes, AI_PROMPT_MESSAGES_ATTRIBUTE, 'gen_ai.request.messages');
  renameAttributeKey(attributes, AI_RESPONSE_TEXT_ATTRIBUTE, 'gen_ai.response.text');
  renameAttributeKey(attributes, AI_RESPONSE_TOOL_CALLS_ATTRIBUTE, 'gen_ai.response.tool_calls');
  renameAttributeKey(attributes, AI_RESPONSE_OBJECT_ATTRIBUTE, 'gen_ai.response.object');
  renameAttributeKey(attributes, AI_PROMPT_TOOLS_ATTRIBUTE, 'gen_ai.request.available_tools');

  renameAttributeKey(attributes, AI_TOOL_CALL_ARGS_ATTRIBUTE, 'gen_ai.tool.input');
  renameAttributeKey(attributes, AI_TOOL_CALL_RESULT_ATTRIBUTE, 'gen_ai.tool.output');

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
  addOriginToSpan(span, 'auto.vercelai.otel');
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.execute_tool');
  renameAttributeKey(attributes, AI_TOOL_CALL_NAME_ATTRIBUTE, 'gen_ai.tool.name');
  renameAttributeKey(attributes, AI_TOOL_CALL_ID_ATTRIBUTE, 'gen_ai.tool.call.id');
  // https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-type
  if (!attributes['gen_ai.tool.type']) {
    span.setAttribute('gen_ai.tool.type', 'function');
  }
  const toolName = attributes['gen_ai.tool.name'];
  if (toolName) {
    span.updateName(`execute_tool ${toolName}`);
  }
}

function processGenerateSpan(span: Span, name: string, attributes: SpanAttributes): void {
  addOriginToSpan(span, 'auto.vercelai.otel');

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute('ai.pipeline.name', nameWthoutAi);
  span.updateName(nameWthoutAi);

  // If a Telemetry name is set and it is a pipeline span, use that as the operation name
  const functionId = attributes[AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
  if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
    span.updateName(`${nameWthoutAi} ${functionId}`);
    span.setAttribute('gen_ai.function_id', functionId);
  }

  if (attributes[AI_PROMPT_ATTRIBUTE]) {
    span.setAttribute('gen_ai.prompt', attributes[AI_PROMPT_ATTRIBUTE]);
  }
  if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
  }
  span.setAttribute('ai.streaming', name.includes('stream'));

  // Generate Spans
  if (name === 'ai.generateText') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateText.doGenerate') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_text');
    span.updateName(`generate_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.streamText') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamText.doStream') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_text');
    span.updateName(`stream_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.generateObject') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateObject.doGenerate') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_object');
    span.updateName(`generate_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.streamObject') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamObject.doStream') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_object');
    span.updateName(`stream_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.embed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embed.doEmbed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed');
    span.updateName(`embed ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.embedMany') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embedMany.doEmbed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed_many');
    span.updateName(`embed_many ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name.startsWith('ai.stream')) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
    return;
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

/**
 * Accumulates token data from a span to its parent in the token accumulator map.
 * This function extracts token usage from the current span and adds it to the
 * accumulated totals for its parent span.
 */
function accumulateTokensForParent(span: SpanJSON, tokenAccumulator: Map<string, TokenSummary>): void {
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
function applyAccumulatedTokens(span: SpanJSON, tokenAccumulator: Map<string, TokenSummary>): void {
  const accumulated = tokenAccumulator.get(span.span_id);
  if (!accumulated) {
    return;
  }

  if (accumulated.inputTokens > 0) {
    span.data[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = accumulated.inputTokens;
  }
  if (accumulated.outputTokens > 0) {
    span.data[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] = accumulated.outputTokens;
  }
  if (accumulated.inputTokens > 0 || accumulated.outputTokens > 0) {
    span.data['gen_ai.usage.total_tokens'] = accumulated.inputTokens + accumulated.outputTokens;
  }
}

function addProviderMetadataToAttributes(attributes: SpanAttributes): void {
  const providerMetadata = attributes[AI_RESPONSE_PROVIDER_METADATA_ATTRIBUTE] as string | undefined;
  if (providerMetadata) {
    try {
      const providerMetadataObject = JSON.parse(providerMetadata) as ProviderMetadata;
      if (providerMetadataObject.openai) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.openai.cachedPromptTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.reasoning',
          providerMetadataObject.openai.reasoningTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.prediction_accepted',
          providerMetadataObject.openai.acceptedPredictionTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.output_tokens.prediction_rejected',
          providerMetadataObject.openai.rejectedPredictionTokens,
        );
        setAttributeIfDefined(attributes, 'gen_ai.conversation.id', providerMetadataObject.openai.responseId);
      }

      if (providerMetadataObject.anthropic) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.anthropic.cacheReadInputTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cache_write',
          providerMetadataObject.anthropic.cacheCreationInputTokens,
        );
      }

      if (providerMetadataObject.bedrock?.usage) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
          providerMetadataObject.bedrock.usage.cacheReadInputTokens,
        );
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cache_write',
          providerMetadataObject.bedrock.usage.cacheWriteInputTokens,
        );
      }

      if (providerMetadataObject.deepseek) {
        setAttributeIfDefined(
          attributes,
          'gen_ai.usage.input_tokens.cached',
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
