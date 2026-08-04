/* eslint-disable typescript-eslint/no-deprecated */
/**
 * Shared utils for AI integrations (OpenAI, Anthropic, Verce.AI, etc.)
 */
import { getClient, isThenable } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GENERAL_FUNCTION_SPAN_OP } from '@sentry/conventions/op';

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
  return NON_INFERENCE_OPERATIONS.has(operationName) ? GENERAL_FUNCTION_SPAN_OP : `gen_ai.${operationName}`;
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
      [GEN_AI_USAGE_INPUT_TOKENS]: promptTokens,
    });
  }
  if (completionTokens !== undefined) {
    span.setAttributes({
      [GEN_AI_USAGE_OUTPUT_TOKENS]: completionTokens,
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
      [GEN_AI_USAGE_TOTAL_TOKENS]: totalTokens,
    });
  }
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

  if (state.promptTokens !== undefined) attrs[GEN_AI_USAGE_INPUT_TOKENS] = state.promptTokens;
  if (state.completionTokens !== undefined) attrs[GEN_AI_USAGE_OUTPUT_TOKENS] = state.completionTokens;

  // Use explicit total if provided (OpenAI, Google), otherwise compute from cache tokens (Anthropic)
  if (state.totalTokens !== undefined) {
    attrs[GEN_AI_USAGE_TOTAL_TOKENS] = state.totalTokens;
  } else if (
    state.promptTokens !== undefined ||
    state.completionTokens !== undefined ||
    state.cacheCreationInputTokens !== undefined ||
    state.cacheReadInputTokens !== undefined
  ) {
    attrs[GEN_AI_USAGE_TOTAL_TOKENS] =
      (state.promptTokens ?? 0) +
      (state.completionTokens ?? 0) +
      (state.cacheCreationInputTokens ?? 0) +
      (state.cacheReadInputTokens ?? 0);
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
