/* eslint-disable typescript-eslint/no-deprecated */
/**
 * Shared utils for AI integrations (OpenAI, Anthropic, Verce.AI, etc.)
 */
import { getClient, isObjectLike, isThenable, stringify } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';

export interface GenAiOptions {
  /**
   * Record input messages/prompts on gen_ai spans. Defaults to the global
   * `dataCollection.genAI.inputs` setting; an explicit value here takes precedence.
   */
  recordInputs?: boolean;
  /**
   * Record output text/responses on gen_ai spans. Defaults to the global
   * `dataCollection.genAI.outputs` setting; an explicit value here takes precedence.
   */
  recordOutputs?: boolean;
}

/**
 * A method registry entry describes a single instrumented method:
 * which gen_ai operation it maps to and whether it is intrinsically streaming.
 */
export interface InstrumentedMethodEntry {
  /** Operation name (e.g. 'chat', 'embeddings', 'generate_content'). Omit for factory methods that only need result proxying. */
  operation?: string;
  /** True if the method itself is always streaming (not param-based) */
  streaming?: boolean;
  /** When set, the method's return value is re-proxied with this as the base path */
  proxyResultPath?: string;
}

/**
 * Maps method paths to their registry entries.
 * Used by proxy-based AI client instrumentations to determine which methods
 * to instrument, what operation name to use, and whether they stream.
 */
export type InstrumentedMethodRegistry = Record<string, InstrumentedMethodEntry>;

// Operation names that are not inference calls: `unknown` is the fallback for methods with no
// registered operation. It should not surface as a `gen_ai.*` op (an unknown string must not
// masquerade as a convention), so it maps to the generic `function` op. The operation name itself
// is preserved on `gen_ai.operation.name`.
const NON_INFERENCE_OPERATIONS = new Set(['unknown']);

/**
 * Derive the span op from a gen_ai operation name. Inference operations become `gen_ai.<operation>`;
 * non-inference operations (`unknown`) become the generic `function` op.
 */
export function getGenAiSpanOp(operationName: string): string {
  return NON_INFERENCE_OPERATIONS.has(operationName) ? FUNCTION : `gen_ai.${operationName}`;
}

/**
 * Resolves AI recording options by falling back to the client's `dataCollection.genAI` settings.
 * Precedence: explicit option > dataCollection.genAI > true (genAI data collected by default)
 */
export function resolveAIRecordingOptions<T extends GenAiOptions>(options?: T): T & Required<GenAiOptions> {
  const genAI = getClient()?.getDataCollectionOptions().genAI;
  return {
    ...options,
    recordInputs: options?.recordInputs ?? genAI?.inputs ?? true,
    recordOutputs: options?.recordOutputs ?? genAI?.outputs ?? true,
  } as T & Required<GenAiOptions>;
}

/**
 * Build method path from current traversal
 */
export function buildMethodPath(currentPath: string, prop: string): string {
  return currentPath ? `${currentPath}.${prop}` : prop;
}

/**
 * A minimal structural check for a web `ReadableStream`.
 *
 * The chunk type is the caller's assumption about the provider's stream (e.g. `Uint8Array` for SSE
 * byte streams); the check itself only looks for the `ReadableStream` methods we rely on.
 */
export function isReadableStream<T = unknown>(value: unknown): value is ReadableStream<T> {
  return (
    isObjectLike(value) &&
    typeof (value as { pipeThrough?: unknown }).pipeThrough === 'function' &&
    typeof (value as { getReader?: unknown }).getReader === 'function'
  );
}

/**
 * Build token usage attributes. Input tokens include cache reads and writes, which are subsets.
 */
export function getTokenUsageAttributes(
  promptTokens?: number,
  completionTokens?: number,
  cacheCreationInputTokens?: number,
  cacheReadInputTokens?: number,
  totalTokens?: number,
): Record<string, number> {
  const attributes: Record<string, number> = {};

  if (typeof promptTokens === 'number') {
    attributes[GEN_AI_USAGE_INPUT_TOKENS] = promptTokens;
  }
  if (typeof cacheCreationInputTokens === 'number') {
    attributes[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS] = cacheCreationInputTokens;
  }
  if (typeof cacheReadInputTokens === 'number') {
    attributes[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS] = cacheReadInputTokens;
  }
  if (typeof completionTokens === 'number') {
    attributes[GEN_AI_USAGE_OUTPUT_TOKENS] = completionTokens;
  }
  if (typeof totalTokens === 'number') {
    attributes[GEN_AI_USAGE_TOTAL_TOKENS] = totalTokens;
  } else if (typeof promptTokens === 'number' || typeof completionTokens === 'number') {
    attributes[GEN_AI_USAGE_TOTAL_TOKENS] =
      (typeof promptTokens === 'number' ? promptTokens : 0) +
      (typeof completionTokens === 'number' ? completionTokens : 0);
  }
  return attributes;
}

/** Set inclusive token usage and cache breakdown attributes. */
export function setTokenUsageAttributes(
  span: Span,
  promptTokens?: number,
  completionTokens?: number,
  cacheCreationInputTokens?: number,
  cacheReadInputTokens?: number,
): void {
  span.setAttributes(
    getTokenUsageAttributes(promptTokens, completionTokens, cacheCreationInputTokens, cacheReadInputTokens),
  );
}

/** One assistant turn for {@link setOutputMessagesAttribute}. */
export interface GenAiOutputMessage {
  /** The message's text content, already flattened out of any content-part array. */
  responseText?: string;
  /** Tool calls in either the OpenAI-compatible (`function.name`) or flat (`name`) shape. */
  toolCalls?: unknown[];
  /** Recorded as `finish_reason` on the message, per the `gen_ai.output.messages` schema. */
  finishReason?: string;
}

/**
 * Build the `gen_ai.output.messages` value (assistant messages with text and/or tool-call parts).
 *
 * We set this in addition to the deprecated `gen_ai.response.text` / `gen_ai.response.tool_calls`
 * attributes because Sentry's product reads the model output from `gen_ai.output.messages` first.
 * Relay migrates `gen_ai.response.text` into `gen_ai.output.messages`, but the tool-calls half of
 * that migration is lossy — so tool-call turns would otherwise render an empty Output.
 *
 * Pass an array for providers that can return more than one choice per response; a single object is
 * the common case of one assistant turn.
 */
export function setOutputMessagesAttribute(span: Span, messages: GenAiOutputMessage | GenAiOutputMessage[]): void {
  const serialized = (Array.isArray(messages) ? messages : [messages])
    .map(buildOutputMessage)
    .filter((message): message is Record<string, unknown> => !!message);

  if (serialized.length > 0) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, JSON.stringify(serialized));
  }
}

function buildOutputMessage({
  responseText,
  toolCalls,
  finishReason,
}: GenAiOutputMessage): Record<string, unknown> | undefined {
  const parts: Array<Record<string, unknown>> = [];

  if (typeof responseText === 'string' && responseText.length > 0) {
    parts.push({ type: 'text', content: responseText });
  }

  if (Array.isArray(toolCalls)) {
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== 'object') {
        continue;
      }
      const call = toolCall as {
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
        name?: unknown;
        arguments?: unknown;
      };
      // Normalize both the OpenAI-compatible shape (name/arguments nested under `function`)
      // and the flat shape some providers use.
      const name = call.function?.name ?? call.name;
      const args = call.function?.arguments ?? call.arguments;
      parts.push({
        type: 'tool_call',
        id: call.id,
        name,
        arguments: stringify(args ?? {}, String),
      });
    }
  }

  if (parts.length === 0) {
    return undefined;
  }

  return finishReason ? { role: 'assistant', parts, finish_reason: finishReason } : { role: 'assistant', parts };
}

export interface StreamResponseState {
  responseId?: string;
  responseModel?: string;
  finishReasons: string[];
  responseTexts: string[];
  toolCalls: unknown[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningOutputTokens?: number;
}

/**
 * Ends a streaming span by setting all accumulated response attributes and ending the span.
 * Shared across OpenAI, Anthropic, and Google GenAI streaming implementations.
 */
export function endStreamSpan(span: Span, state: StreamResponseState, recordOutputs: boolean): void {
  if (!span.isRecording()) {
    return;
  }

  const attrs: Record<string, string | number | boolean> = {
    [GEN_AI_RESPONSE_STREAMING]: true,
  };

  if (state.responseId) attrs[GEN_AI_RESPONSE_ID] = state.responseId;
  if (state.responseModel) attrs[GEN_AI_RESPONSE_MODEL] = state.responseModel;

  Object.assign(
    attrs,
    getTokenUsageAttributes(
      state.promptTokens,
      state.completionTokens,
      state.cacheCreationInputTokens,
      state.cacheReadInputTokens,
      state.totalTokens,
    ),
  );
  if (typeof state.reasoningOutputTokens === 'number') {
    attrs[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS] = state.reasoningOutputTokens;
  }

  if (state.finishReasons.length) {
    attrs[GEN_AI_RESPONSE_FINISH_REASONS] = JSON.stringify(state.finishReasons);
  }
  if (recordOutputs && state.responseTexts.length) {
    attrs[GEN_AI_RESPONSE_TEXT] = state.responseTexts.join('');
  }
  if (recordOutputs && state.toolCalls.length) {
    attrs[GEN_AI_RESPONSE_TOOL_CALLS] = JSON.stringify(state.toolCalls);
  }

  span.setAttributes(attrs);
  span.end();
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

/**
 * Creates a wrapped version of .withResponse() that replaces the data field
 * with the instrumented result while preserving metadata (response, request_id).
 */
async function createWithResponseWrapper<T>(
  originalWithResponse: Promise<unknown>,
  instrumentedPromise: Promise<T>,
): Promise<unknown> {
  // Awaited together rather than in sequence so both promises get a handler attached synchronously.
  // Awaiting them one after the other leaves the second unobserved when the first rejects, which
  // surfaces as an unhandled rejection.
  const [instrumentedResult, originalWrapper] = await Promise.all([instrumentedPromise, originalWithResponse]);

  // Combine instrumented result with original metadata
  if (originalWrapper && typeof originalWrapper === 'object' && 'data' in originalWrapper) {
    return {
      ...originalWrapper,
      data: instrumentedResult,
    };
  }
  return instrumentedResult;
}

/**
 * Wraps a promise-like object to preserve additional methods (like .withResponse())
 * that AI SDK clients (OpenAI, Anthropic) attach to their APIPromise return values.
 *
 * Standard Promise methods (.then, .catch, .finally) are routed to the instrumented
 * promise to preserve Sentry's span instrumentation, while custom SDK methods are
 * forwarded to the original promise to maintain the SDK's API surface.
 */
export function wrapPromiseWithMethods<R>(
  originalPromiseLike: Promise<R>,
  instrumentedPromise: Promise<R>,
): Promise<R> {
  // If the original result is not thenable, return the instrumented promise
  if (!isThenable(originalPromiseLike)) {
    return instrumentedPromise;
  }

  // Create a proxy that forwards Promise methods to instrumentedPromise
  // and preserves additional methods from the original result
  return new Proxy(originalPromiseLike, {
    get(target: object, prop: string | symbol): unknown {
      // For standard Promise methods (.then, .catch, .finally, Symbol.toStringTag),
      // use instrumentedPromise to preserve Sentry instrumentation.
      // For custom methods (like .withResponse()), use the original target.
      const useInstrumentedPromise = prop in Promise.prototype || prop === Symbol.toStringTag;
      const source = useInstrumentedPromise ? instrumentedPromise : target;

      const value = Reflect.get(source, prop) as unknown;

      // Special handling for .withResponse() to preserve instrumentation
      // .withResponse() returns { data: T, response: Response, request_id: string }
      if (prop === 'withResponse' && typeof value === 'function') {
        return function wrappedWithResponse(this: unknown): unknown {
          const originalWithResponse = (value as (...args: unknown[]) => unknown).call(target);
          return createWithResponseWrapper(originalWithResponse, instrumentedPromise);
        };
      }

      return typeof value === 'function' ? value.bind(source) : value;
    },
  }) as Promise<R>;
}
