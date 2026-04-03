/**
 * Shared utils for AI integrations (OpenAI, Anthropic, Verce.AI, etc.)
 */
import { captureException } from '../../exports';
import { getClient } from '../../currentScopes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import { isThenable } from '../../utils/is';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from './gen-ai-attributes';
import { truncateGenAiMessages, truncateGenAiStringInput } from './messageTruncation';

export interface AIRecordingOptions {
  recordInputs?: boolean;
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

/**
 * Resolves AI recording options by falling back to the client's `sendDefaultPii` setting.
 * Precedence: explicit option > sendDefaultPii > false
 */
export function resolveAIRecordingOptions<T extends AIRecordingOptions>(options?: T): T & Required<AIRecordingOptions> {
  const sendDefaultPii = Boolean(getClient()?.getOptions().sendDefaultPii);
  return {
    ...options,
    recordInputs: options?.recordInputs ?? sendDefaultPii,
    recordOutputs: options?.recordOutputs ?? sendDefaultPii,
  } as T & Required<AIRecordingOptions>;
}

/**
 * Build method path from current traversal
 */
export function buildMethodPath(currentPath: string, prop: string): string {
  return currentPath ? `${currentPath}.${prop}` : prop;
}

/**
 * Extract model from params or context.
 * params.model covers OpenAI/Anthropic, context.model/modelVersion covers Google GenAI chat instances.
 */
export function extractModel(params: Record<string, unknown> | undefined, context?: unknown): string {
  if (params && 'model' in params && typeof params.model === 'string') {
    return params.model;
  }
  // Google GenAI chat instances store the model on the context object
  if (context && typeof context === 'object') {
    const ctx = context as Record<string, unknown>;
    if (typeof ctx.model === 'string') return ctx.model;
    if (typeof ctx.modelVersion === 'string') return ctx.modelVersion;
  }
  return 'unknown';
}

/**
 * Set an attribute if the key exists in the source object.
 */
function extractIfPresent(
  attributes: Record<string, SpanAttributeValue>,
  source: Record<string, unknown>,
  key: string,
  attribute: string,
): void {
  if (key in source) {
    attributes[attribute] = source[key] as SpanAttributeValue;
  }
}

/**
 * Extract available tools from request parameters.
 * Handles OpenAI (params.tools + web_search_options), Anthropic (params.tools),
 * and Google GenAI (config.tools[].functionDeclarations).
 */
function extractTools(params: Record<string, unknown>, config: Record<string, unknown>): string | undefined {
  // OpenAI: web_search_options are treated as tools
  const hasWebSearchOptions = params.web_search_options && typeof params.web_search_options === 'object';
  const webSearchOptions = hasWebSearchOptions
    ? [{ type: 'web_search_options', ...(params.web_search_options as Record<string, unknown>) }]
    : [];

  // Google GenAI: tools contain functionDeclarations
  if ('tools' in config && Array.isArray(config.tools)) {
    const hasDeclarations = config.tools.some(
      (tool: unknown) =>
        tool && typeof tool === 'object' && 'functionDeclarations' in (tool as Record<string, unknown>),
    );
    if (hasDeclarations) {
      const declarations = (config.tools as Array<{ functionDeclarations?: unknown[] }>).flatMap(
        tool => tool.functionDeclarations ?? [],
      );
      if (declarations.length > 0) {
        return JSON.stringify(declarations);
      }
      return undefined;
    }
  }

  // OpenAI / Anthropic: tools are at the top level
  const tools = Array.isArray(params.tools) ? params.tools : [];
  const availableTools = [...tools, ...webSearchOptions];

  if (availableTools.length === 0) {
    return undefined;
  }

  return JSON.stringify(availableTools);
}

/**
 * Extract conversation ID from request parameters.
 * Supports OpenAI Conversations API and previous_response_id chaining.
 */
function extractConversationId(params: Record<string, unknown>): string | undefined {
  if ('conversation' in params && typeof params.conversation === 'string') {
    return params.conversation;
  }
  if ('previous_response_id' in params && typeof params.previous_response_id === 'string') {
    return params.previous_response_id;
  }
  return undefined;
}

/**
 * Extract request attributes from AI method arguments.
 * Shared across all AI provider integrations (OpenAI, Anthropic, Google GenAI).
 */
export function extractRequestAttributes(
  system: string,
  origin: string,
  operationName: string,
  args: unknown[],
  context?: unknown,
): Record<string, SpanAttributeValue> {
  const params =
    args.length > 0 && typeof args[0] === 'object' && args[0] !== null
      ? (args[0] as Record<string, unknown>)
      : undefined;

  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: system,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: extractModel(params, context),
  };

  if (!params) {
    return attributes;
  }

  // Google GenAI nests generation params under config; OpenAI/Anthropic are flat
  const config =
    'config' in params && typeof params.config === 'object' && params.config
      ? (params.config as Record<string, unknown>)
      : params;

  // Generation parameters — handles both snake_case (OpenAI/Anthropic) and camelCase (Google GenAI)
  extractIfPresent(attributes, config, 'temperature', GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE);
  extractIfPresent(attributes, config, 'top_p', GEN_AI_REQUEST_TOP_P_ATTRIBUTE);
  extractIfPresent(attributes, config, 'topP', GEN_AI_REQUEST_TOP_P_ATTRIBUTE);
  extractIfPresent(attributes, config, 'top_k', GEN_AI_REQUEST_TOP_K_ATTRIBUTE);
  extractIfPresent(attributes, config, 'topK', GEN_AI_REQUEST_TOP_K_ATTRIBUTE);
  extractIfPresent(attributes, config, 'frequency_penalty', GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE);
  extractIfPresent(attributes, config, 'frequencyPenalty', GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE);
  extractIfPresent(attributes, config, 'presence_penalty', GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE);
  extractIfPresent(attributes, config, 'presencePenalty', GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE);
  extractIfPresent(attributes, config, 'max_tokens', GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE);
  extractIfPresent(attributes, config, 'maxOutputTokens', GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE);
  extractIfPresent(attributes, params, 'stream', GEN_AI_REQUEST_STREAM_ATTRIBUTE);
  extractIfPresent(attributes, params, 'encoding_format', GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE);
  extractIfPresent(attributes, params, 'dimensions', GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE);

  // Tools
  const tools = extractTools(params, config);
  if (tools) {
    attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = tools;
  }

  // Conversation ID (OpenAI)
  const conversationId = extractConversationId(params);
  if (conversationId) {
    attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE] = conversationId;
  }

  return attributes;
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
    [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
  };

  if (state.responseId) attrs[GEN_AI_RESPONSE_ID_ATTRIBUTE] = state.responseId;
  if (state.responseModel) attrs[GEN_AI_RESPONSE_MODEL_ATTRIBUTE] = state.responseModel;

  if (state.promptTokens !== undefined) attrs[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = state.promptTokens;
  if (state.completionTokens !== undefined) attrs[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] = state.completionTokens;

  // Use explicit total if provided (OpenAI, Google), otherwise compute from cache tokens (Anthropic)
  if (state.totalTokens !== undefined) {
    attrs[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE] = state.totalTokens;
  } else if (
    state.promptTokens !== undefined ||
    state.completionTokens !== undefined ||
    state.cacheCreationInputTokens !== undefined ||
    state.cacheReadInputTokens !== undefined
  ) {
    attrs[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE] =
      (state.promptTokens ?? 0) +
      (state.completionTokens ?? 0) +
      (state.cacheCreationInputTokens ?? 0) +
      (state.cacheReadInputTokens ?? 0);
  }

  if (state.finishReasons.length) {
    attrs[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE] = JSON.stringify(state.finishReasons);
  }
  if (recordOutputs && state.responseTexts.length) {
    attrs[GEN_AI_RESPONSE_TEXT_ATTRIBUTE] = state.responseTexts.join('');
  }
  if (recordOutputs && state.toolCalls.length) {
    attrs[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] = JSON.stringify(state.toolCalls);
  }

  span.setAttributes(attrs);
  span.end();
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

/**
 * Creates a wrapped version of .withResponse() that replaces the data field
 * with the instrumented result while preserving metadata (response, request_id).
 */
async function createWithResponseWrapper<T>(
  originalWithResponse: Promise<unknown>,
  instrumentedPromise: Promise<T>,
  mechanismType: string,
): Promise<unknown> {
  // Attach catch handler to originalWithResponse immediately to prevent unhandled rejection
  // If instrumentedPromise rejects first, we still need this handled
  const safeOriginalWithResponse = originalWithResponse.catch(error => {
    captureException(error, {
      mechanism: {
        handled: false,
        type: mechanismType,
      },
    });
    throw error;
  });

  const instrumentedResult = await instrumentedPromise;
  const originalWrapper = await safeOriginalWithResponse;

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
  mechanismType: string,
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
          return createWithResponseWrapper(originalWithResponse, instrumentedPromise, mechanismType);
        };
      }

      return typeof value === 'function' ? value.bind(source) : value;
    },
  }) as Promise<R>;
}
