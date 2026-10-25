import type { Span, SpanAttributes } from '@sentry/core';
import { isObjectLike, SPAN_STATUS_ERROR, startInactiveSpan, stringify } from '@sentry/core';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { TANSTACK_AI_ORIGIN } from './constants';
import { usageAttributes } from './utils';

/**
 * A `@tanstack/ai` activity other than `chat()`, traced through its orchestrion channel. Its middleware
 * gets neither the input of the call nor the result, and cannot make a span active during the provider
 * request.
 */
export interface TanstackAiGenerationActivity {
  /** The `gen_ai.operation.name` of the span. */
  operation: string;
  /** The name of the adapter method that sends the provider request. */
  adapterMethod: string;
  /** Attributes from the options of the call. */
  requestAttributes?: (options: Record<string, unknown>) => SpanAttributes;
  /**
   * Attributes from the value that the adapter method resolves to. They are recorded also when TanStack AI throws
   * after the provider answered, e.g. for a rerank index out of range, because the provider bills that call too.
   */
  responseAttributes: (adapterResult: Record<string, unknown>) => SpanAttributes;
}

export const TANSTACK_AI_EMBED: TanstackAiGenerationActivity = {
  operation: 'embeddings',
  adapterMethod: 'createEmbeddings',
  requestAttributes: ({ input }) => (input !== undefined ? { [GEN_AI_EMBEDDINGS_INPUT]: embeddingsInput(input) } : {}),
  // The adapters make `id` themselves, so it is not the provider's response id. An embedding has no output
  // tokens, but the OpenAI adapter reports 0.
  responseAttributes: ({ model, usage }) =>
    responseMetadataAttributes({
      model,
      usage: isObjectLike(usage) ? { ...usage, completionTokens: undefined } : usage,
    }),
};

export const TANSTACK_AI_RERANK: TanstackAiGenerationActivity = {
  operation: 'rerank',
  adapterMethod: 'rerank',
  // Rerank models bill search units. The OpenRouter adapter reports 0 input and output tokens, so only the
  // total and the cost are real, and it makes `id` itself when the response has none.
  responseAttributes: ({ model, usage }) =>
    responseMetadataAttributes({
      model,
      usage: isObjectLike(usage) ? { ...usage, promptTokens: undefined, completionTokens: undefined } : usage,
    }),
};

/** Start the span of an activity call, or return `undefined` for options that are not a call's options. */
export function startGenerationSpan(
  activity: TanstackAiGenerationActivity,
  callOptions: unknown,
  options: GenAiOptions,
): Span | undefined {
  if (!isObjectLike(callOptions) || !isObjectLike(callOptions.adapter)) {
    return undefined;
  }
  // As in `chat()`, `provider` is the vendor of an adapter whose `name` also names the wire API.
  const { name, provider = name, model } = callOptions.adapter;
  if (typeof provider !== 'string' || typeof model !== 'string') {
    return undefined;
  }

  const { recordInputs } = resolveAIRecordingOptions(options);
  return startInactiveSpan({
    name: `${activity.operation} ${model}`,
    op: getGenAiSpanOp(activity.operation),
    attributes: {
      [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
      [GEN_AI_OPERATION_NAME]: activity.operation,
      [GEN_AI_PROVIDER_NAME]: provider,
      [GEN_AI_REQUEST_MODEL]: model,
      ...(recordInputs ? activity.requestAttributes?.(callOptions) : {}),
    },
  });
}

export function setGenerationResponseAttributes(
  span: Span,
  activity: TanstackAiGenerationActivity,
  adapterResult: unknown,
): void {
  if (isObjectLike(adapterResult)) {
    span.setAttributes(activity.responseAttributes(adapterResult));
  }
}

/** Record what the error that a call threw tells. */
export function setGenerationEndAttributes(span: Span, call: OrchestrionChannelContext): void {
  if ('result' in call) {
    return;
  }
  // As for `chat()`, a call that the app aborted counts as cancelled.
  const [callOptions] = call.arguments;
  if (isObjectLike(callOptions) && (callOptions.abortSignal as AbortSignal | undefined)?.aborted) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
  }
}

function responseMetadataAttributes({ id, model, usage }: Record<string, unknown>): SpanAttributes {
  return {
    ...(typeof id === 'string' ? { [GEN_AI_RESPONSE_ID]: id } : {}),
    ...(typeof model === 'string' ? { [GEN_AI_RESPONSE_MODEL]: model } : {}),
    ...(isObjectLike(usage) ? usageAttributes(usage) : {}),
  };
}

/** An input item is a string, a content part, or an array of content parts. */
function embeddingsInput(input: unknown): string | undefined {
  if (typeof input === 'string') {
    return input;
  }
  // Media parts carry inline bytes or provider handles; keep only their kind.
  const withoutMedia = (part: unknown): unknown =>
    isObjectLike(part) && typeof part.type === 'string'
      ? part.type === 'text'
        ? part.content
        : { type: part.type }
      : part;
  const items = Array.isArray(input) ? input : [input];
  return stringify(items.map(item => (Array.isArray(item) ? item.map(withoutMedia) : withoutMedia(item))));
}
