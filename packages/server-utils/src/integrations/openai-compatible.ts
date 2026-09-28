import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Integration, IntegrationFn, Span, SpanAttributeValue } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { GEN_AI_PROVIDER_NAME } from '@sentry/conventions/attributes';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../ai/core/utils';
import { addRequestAttributes, extractRequestAttributes } from '../ai/openai';
import { instrumentStream } from '../ai/openai/streaming';
import type { OpenAiOptions } from '../ai/openai/types';
import { addResponseAttributes } from '../ai/openai/utils';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindTracingChannelToSpan } from '../tracing-channel';

/**
 * Describes an OpenAI-compatible provider whose SDK mirrors the openai wire format (Groq, Together, ...),
 * so the span building, streaming and response parsing can all be reused from `ai/openai`.
 */
export interface OpenAiCompatibleProvider {
  /** Integration name; also the key used to skip double-wrapping when another provider drives the SDK. */
  integrationName: string;
  /** Value reported on `gen_ai.provider.name`. */
  providerName: string;
  /** Span origin, `auto.ai.<provider>`. */
  origin: string;
  /** The instrumented `module.name`s (from the orchestrion config's `getModuleNames`). */
  moduleNames: string[];
  /** The fully-qualified orchestrion channels this provider publishes to. */
  channels: { chat: string; embeddings: string };
}

/**
 * The context orchestrion shares across the tracing-channel lifecycle hooks: `arguments` is the live args
 * array passed to `Completions.create(body, options)`, and Node's `tracingChannel` attaches `result` when
 * the returned promise settles.
 */
interface OpenAiCompatibleChannelContext {
  arguments: unknown[];
  result?: unknown;
}

/**
 * Builds a diagnostics-channel integration for an OpenAI-compatible provider SDK. It subscribes to the
 * `orchestrion:<module>:{chat,embeddings}` channels injected into the SDK's `create` methods, so it
 * requires the Sentry runtime hook or bundler plugin. Everything below the channel — request/response
 * attributes and streaming — is shared with the openai integration; only the provider name and origin
 * differ.
 */
export function createOpenAiCompatibleIntegration<T extends OpenAiCompatibleProvider>(
  provider: T,
): (options?: OpenAiOptions) => Integration & { name: T['integrationName'] } {
  const instrumentedChannels = [
    { channel: provider.channels.chat, operation: 'chat' },
    { channel: provider.channels.embeddings, operation: 'embeddings' },
  ] as const;

  function instrument(options: OpenAiOptions): void {
    for (const { channel, operation } of instrumentedChannels) {
      bindTracingChannelToSpan(
        diagnosticsChannel.tracingChannel<OpenAiCompatibleChannelContext>(channel),
        data => createGenAiSpan(data, operation, provider, options),
        {
          beforeSpanEnd: (span, data) => {
            addResponseAttributes(span, data.result, resolveAIRecordingOptions(options).recordOutputs);
          },
          // Streaming: the result is a `Stream` consumed later, so instrument it and let it end the span.
          deferSpanEnd: ({ span, data }) => wrapStreamResult(span, data, options),
        },
      );
    }
  }

  return ((options: OpenAiOptions = {}) => {
    return {
      name: provider.integrationName,
      setup(client) {
        invokeOrchestrionInstrumentation(client, provider.moduleNames, instrument, [options]);
      },
    };
  }) satisfies IntegrationFn;
}

/**
 * Build the span for an instrumented `create` call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(
  data: OpenAiCompatibleChannelContext,
  operation: string,
  provider: OpenAiCompatibleProvider,
  options: OpenAiOptions,
): Span | undefined {
  // When another provider (e.g. LangChain) is driving the SDK, it records the spans itself and marks this
  // provider as skipped; skip here to avoid double spans.
  if (_INTERNAL_shouldSkipAiProviderWrapping(provider.integrationName)) {
    return undefined;
  }

  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  const { recordInputs } = resolveAIRecordingOptions(options);

  // `extractRequestAttributes` defaults the provider to openai; override it for the concrete provider.
  const attributes = extractRequestAttributes(args, operation, recordInputs);
  attributes[GEN_AI_PROVIDER_NAME] = provider.providerName;
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = provider.origin;
  const model = (params?.model as string) || 'unknown';
  const client = getClient();

  const span = startInactiveSpan({
    // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
    name: model !== 'unknown' || !(client && hasSpanStreamingEnabled(client)) ? `${operation} ${model}` : operation,
    op: getGenAiSpanOp(operation),
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addRequestAttributes(span, params, operation);
  }

  return span;
}

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

/**
 * For a streaming `create({ stream: true })` the result is a `Stream` the caller consumes later. We can't
 * swap what `create` returns, but the `Stream` in `data.result` is the same instance the caller holds and
 * `asyncEnd` fires before the caller iterates — so we patch its async iterator in place to run through
 * `instrumentStream`, which accumulates the streamed attributes and ends the span when iteration finishes.
 * Only a streaming call resolves to an async-iterable, so that check alone distinguishes it. Returns `true`
 * to hand span-ending ownership to `instrumentStream`; `false` for non-streaming/errored results, which end
 * via the normal `beforeSpanEnd` path.
 */
function wrapStreamResult(span: Span, data: OpenAiCompatibleChannelContext, options: OpenAiOptions): boolean {
  const result = data.result;
  if (!isAsyncIterable(result)) {
    return false;
  }

  const { recordOutputs } = resolveAIRecordingOptions(options);
  const iterate = result[Symbol.asyncIterator].bind(result);
  const instrumented = instrumentStream({ [Symbol.asyncIterator]: iterate }, span, recordOutputs ?? false);
  result[Symbol.asyncIterator] = () => instrumented;

  return true;
}
