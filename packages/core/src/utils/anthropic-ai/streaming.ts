import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { setTokenUsageAttributes } from '../ai/utils';
import type { AnthropicAiStreamingEvent } from './types';

/**
 * State object used to accumulate information from a stream of Anthropic AI events.
 */
interface StreamingState {
  /** Collected response text fragments (for output recording). */
  responseTexts: string[];
  /** Reasons for finishing the response, as reported by the API. */
  finishReasons: string[];
  /** The response ID. */
  responseId: string;
  /** The model name. */
  responseModel: string;
  /** Number of prompt/input tokens used. */
  promptTokens: number | undefined;
  /** Number of completion/output tokens used. */
  completionTokens: number | undefined;
  /** Number of cache creation input tokens used. */
  cacheCreationInputTokens: number | undefined;
  /** Number of cache read input tokens used. */
  cacheReadInputTokens: number | undefined;
  /** Accumulated tool calls (finalized) */
  toolCalls: Array<Record<string, unknown>>;
  /** In-progress tool call blocks keyed by index */
  activeToolBlocks: Record<
    number,
    {
      id?: string;
      name?: string;
      inputJsonParts: string[];
    }
  >;
}

/**
 * Checks if an event is an error event
 * @param event - The event to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 * @param span - The span to update
 * @returns Whether an error occurred
 */

function isErrorEvent(event: AnthropicAiStreamingEvent, span: Span): boolean {
  if ('type' in event && typeof event.type === 'string') {
    // If the event is an error, set the span status and capture the error
    // These error events are not rejected by the API by default, but are sent as metadata of the response
    if (event.type === 'error') {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: event.error?.type ?? 'unknown_error' });
      captureException(event.error, {
        mechanism: {
          handled: false,
          type: 'auto.ai.anthropic.anthropic_error',
        },
      });
      return true;
    }
  }
  return false;
}

/**
 * Processes the message metadata of an event
 * @param event - The event to process
 * @param state - The state of the streaming process
 */

function handleMessageMetadata(event: AnthropicAiStreamingEvent, state: StreamingState): void {
  // The token counts shown in the usage field of the message_delta event are cumulative.
  // @see https://docs.anthropic.com/en/docs/build-with-claude/streaming#event-types
  if (event.type === 'message_delta' && event.usage) {
    if ('output_tokens' in event.usage && typeof event.usage.output_tokens === 'number') {
      state.completionTokens = event.usage.output_tokens;
    }
  }

  if (event.message) {
    const message = event.message;

    if (message.id) state.responseId = message.id;
    if (message.model) state.responseModel = message.model;
    if (message.stop_reason) state.finishReasons.push(message.stop_reason);

    if (message.usage) {
      if (typeof message.usage.input_tokens === 'number') state.promptTokens = message.usage.input_tokens;
      if (typeof message.usage.cache_creation_input_tokens === 'number')
        state.cacheCreationInputTokens = message.usage.cache_creation_input_tokens;
      if (typeof message.usage.cache_read_input_tokens === 'number')
        state.cacheReadInputTokens = message.usage.cache_read_input_tokens;
    }
  }
}

/**
 * Handle start of a content block (e.g., tool_use)
 */
function handleContentBlockStart(event: AnthropicAiStreamingEvent, state: StreamingState): void {
  if (event.type !== 'content_block_start' || typeof event.index !== 'number' || !event.content_block) return;
  if (event.content_block.type === 'tool_use' || event.content_block.type === 'server_tool_use') {
    state.activeToolBlocks[event.index] = {
      id: event.content_block.id,
      name: event.content_block.name,
      inputJsonParts: [],
    };
  }
}

/**
 * Handle deltas of a content block, including input_json_delta for tool_use
 */
function handleContentBlockDelta(
  event: AnthropicAiStreamingEvent,
  state: StreamingState,
  recordOutputs: boolean,
): void {
  if (event.type !== 'content_block_delta' || !event.delta) return;

  // Accumulate tool_use input JSON deltas only when we have an index and an active tool block
  if (
    typeof event.index === 'number' &&
    'partial_json' in event.delta &&
    typeof event.delta.partial_json === 'string'
  ) {
    const active = state.activeToolBlocks[event.index];
    if (active) {
      active.inputJsonParts.push(event.delta.partial_json);
    }
  }

  // Accumulate streamed response text regardless of index
  if (recordOutputs && typeof event.delta.text === 'string') {
    state.responseTexts.push(event.delta.text);
  }
}

/**
 * Handle stop of a content block; finalize tool_use entries
 */
function handleContentBlockStop(event: AnthropicAiStreamingEvent, state: StreamingState): void {
  if (event.type !== 'content_block_stop' || typeof event.index !== 'number') return;

  const active = state.activeToolBlocks[event.index];
  if (!active) return;

  const raw = active.inputJsonParts.join('');
  let parsedInput: unknown;

  try {
    parsedInput = raw ? JSON.parse(raw) : {};
  } catch {
    parsedInput = { __unparsed: raw };
  }

  state.toolCalls.push({
    type: 'tool_use',
    id: active.id,
    name: active.name,
    input: parsedInput,
  });

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete state.activeToolBlocks[event.index];
}

/**
 * Processes an event
 * @param event - The event to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 * @param span - The span to update
 */
function processEvent(
  event: AnthropicAiStreamingEvent,
  state: StreamingState,
  recordOutputs: boolean,
  span: Span,
): void {
  if (!(event && typeof event === 'object')) {
    return;
  }

  const isError = isErrorEvent(event, span);
  if (isError) return;

  handleMessageMetadata(event, state);

  // Tool call events are sent via 3 separate events:
  // - content_block_start (start of the tool call)
  // - content_block_delta (delta aka input of the tool call)
  // - content_block_stop (end of the tool call)
  // We need to handle them all to capture the full tool call.
  handleContentBlockStart(event, state);
  handleContentBlockDelta(event, state, recordOutputs);
  handleContentBlockStop(event, state);
}

/**
 * Finalizes span attributes when stream processing completes
 */
function finalizeStreamSpan(state: StreamingState, span: Span, recordOutputs: boolean): void {
  // Set common response attributes if available
  if (state.responseId) {
    span.setAttributes({
      [GEN_AI_RESPONSE_ID_ATTRIBUTE]: state.responseId,
    });
  }
  if (state.responseModel) {
    span.setAttributes({
      [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: state.responseModel,
    });
  }

  setTokenUsageAttributes(
    span,
    state.promptTokens,
    state.completionTokens,
    state.cacheCreationInputTokens,
    state.cacheReadInputTokens,
  );

  span.setAttributes({
    [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
  });

  if (state.finishReasons.length > 0) {
    span.setAttributes({
      [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(state.finishReasons),
    });
  }

  if (recordOutputs && state.responseTexts.length > 0) {
    span.setAttributes({
      [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: state.responseTexts.join(''),
    });
  }

  // Set tool calls if any were captured
  if (recordOutputs && state.toolCalls.length > 0) {
    span.setAttributes({
      [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(state.toolCalls),
    });
  }

  span.end();
}

/**
 * Instruments a MessageStream by registering event handlers and preserving the original stream API.
 */
export function instrumentStream<R extends { on: (...args: unknown[]) => void }>(
  stream: R,
  span: Span,
  recordOutputs: boolean,
): R {
  const state: StreamingState = {
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    promptTokens: undefined,
    completionTokens: undefined,
    cacheCreationInputTokens: undefined,
    cacheReadInputTokens: undefined,
    toolCalls: [],
    activeToolBlocks: {},
  };

  stream.on('streamEvent', (event: unknown) => {
    processEvent(event as AnthropicAiStreamingEvent, state, recordOutputs, span);
  });

  // The event fired when a message is done being streamed by the API. Corresponds to the message_stop SSE event.
  // @see https://github.com/anthropics/anthropic-sdk-typescript/blob/d3be31f5a4e6ebb4c0a2f65dbb8f381ae73a9166/helpers.md?plain=1#L42-L44
  stream.on('message', () => {
    finalizeStreamSpan(state, span, recordOutputs);
  });

  stream.on('error', (error: unknown) => {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'stream_error' });
    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.ai.anthropic.stream_error',
      },
    });
    span.end();
  });

  return stream;
}
