import type { SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import type { OpenAiProviderMetadata, ProviderMetadata } from './vercel-ai-attributes';

/**
 * Derive the `gen_ai.usage.*` cache/reasoning/prediction token attributes and `gen_ai.conversation.id`
 * from an AI SDK `providerMetadata` object.
 *
 * Used by the `ai` >= 7 tracing-channel subscriber, which receives `providerMetadata` as an object on
 * the channel result. Pass the already-parsed object; unknown/empty input yields `{}`.
 */
export function getProviderMetadataAttributes(providerMetadata: unknown): Record<string, number | string> {
  const attributes: Record<string, number | string> = {};

  if (!providerMetadata || typeof providerMetadata !== 'object') {
    return attributes;
  }
  const metadata = providerMetadata as ProviderMetadata;

  // OpenAI (v5 uses 'openai', v6 Azure Responses API uses 'azure')
  const openaiMetadata: OpenAiProviderMetadata | undefined = metadata.openai ?? metadata.azure;
  if (openaiMetadata) {
    setAttributeIfDefined(attributes, GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, openaiMetadata.cachedPromptTokens);
    setAttributeIfDefined(attributes, GEN_AI_USAGE_REASONING_OUTPUT_TOKENS, openaiMetadata.reasoningTokens);
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
    setAttributeIfDefined(attributes, GEN_AI_CONVERSATION_ID, openaiMetadata.responseId);
  }

  if (metadata.anthropic) {
    const cachedInputTokens =
      metadata.anthropic.usage?.cache_read_input_tokens ?? metadata.anthropic.cacheReadInputTokens;
    setAttributeIfDefined(attributes, GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, cachedInputTokens);

    const cacheWriteInputTokens =
      metadata.anthropic.usage?.cache_creation_input_tokens ?? metadata.anthropic.cacheCreationInputTokens;
    setAttributeIfDefined(attributes, GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS, cacheWriteInputTokens);
  }

  if (metadata.bedrock?.usage) {
    setAttributeIfDefined(
      attributes,
      GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
      metadata.bedrock.usage.cacheReadInputTokens,
    );
    setAttributeIfDefined(
      attributes,
      GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
      metadata.bedrock.usage.cacheWriteInputTokens,
    );
  }

  if (metadata.deepseek) {
    setAttributeIfDefined(attributes, GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, metadata.deepseek.promptCacheHitTokens);
    setAttributeIfDefined(attributes, 'gen_ai.usage.input_tokens.cache_miss', metadata.deepseek.promptCacheMissTokens);
  }

  // Google (v5 uses 'google', v6 Vertex AI uses 'vertex'). Gemini reports its reasoning ("thoughts")
  // tokens separately from the candidate output count, so the SDK's `outputTokens` covers only the
  // visible answer. Recompute output from `candidatesTokenCount + thoughtsTokenCount` rather than
  // adding onto the existing value, which stays correct on `ai` v6+ where `outputTokens` already
  // folds reasoning in. `candidatesTokenCount` is omitted when the response is truncated during
  // thinking, which means no candidate tokens, so it counts as zero. Reasoning is a subset of
  // output per the conventions, so it is only written alongside the output it belongs to.
  const googleUsage = (metadata.google ?? metadata.vertex)?.usageMetadata;
  if (googleUsage && typeof googleUsage.thoughtsTokenCount === 'number' && googleUsage.thoughtsTokenCount > 0) {
    attributes[GEN_AI_USAGE_OUTPUT_TOKENS] = (googleUsage.candidatesTokenCount ?? 0) + googleUsage.thoughtsTokenCount;
    setAttributeIfDefined(attributes, GEN_AI_USAGE_TOTAL_TOKENS, googleUsage.totalTokenCount);
    setAttributeIfDefined(attributes, GEN_AI_USAGE_REASONING_OUTPUT_TOKENS, googleUsage.thoughtsTokenCount);
  }

  return attributes;
}

/**
 * Usage attributes derived from `providerMetadata`, which describes only the last step of a call.
 * They must not be written onto a span that reports usage aggregated across steps
 * (`gen_ai.invoke_agent`), where they would replace the aggregate with one step's figures.
 */
export const LAST_STEP_ONLY_USAGE_KEYS = new Set<string>([GEN_AI_USAGE_OUTPUT_TOKENS, GEN_AI_USAGE_TOTAL_TOKENS]);

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
