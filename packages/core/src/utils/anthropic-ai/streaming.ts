import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import {
  ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { setTokenUsageAttributes } from '../ai/utils';
import type { AnthropicAiStreamingEvent } from './types';

/**
 * State object used to accumulate information from a stream of Anthropic AI events.
 */

interface StreamingState {
  /** Types of events encountered in the stream. */
  eventTypes: string[];
  /** Collected response text fragments (for output recording). */
  responseTexts: string[];
  /** Reasons for finishing the response, as reported by the API. */
  finishReasons: string[];
  /** The response ID. */
  responseId: string;
  /** The model name. */
  responseModel: string;
  /** The timestamp of the response. */
  responseTimestamp: number;
  /** Number of prompt/input tokens used. */
  promptTokens: number | undefined;
  /** Number of completion/output tokens used. */
  completionTokens: number | undefined;
  /** Number of cache creation input tokens used. */
  cacheCreationInputTokens: number | undefined;
  /** Number of cache read input tokens used. */
  cacheReadInputTokens: number | undefined;
}

/**
 * Checks if an event is an error event
 * @param event - The event to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 * @param span - The span to update
 * @returns Whether an error occurred
 */

function isErrorEvent(
  event: AnthropicAiStreamingEvent,
  state: StreamingState,
  recordOutputs: boolean,
  span: Span,
): boolean {
  if ('type' in event && typeof event.type === 'string') {
    state.eventTypes.push(event.type);

    // If the event is an error, set the span status and capture the error
    // These error events are not rejected by the API by default, but are sent as metadata of the response
    if (event.type === 'error') {
      const message = event.error?.message ?? 'internal_error';
      span.setStatus({ code: SPAN_STATUS_ERROR, message });
      captureException(new Error(`anthropic_stream_error: ${message}`), {
        mechanism: {
          handled: false,
          type: 'auto.ai.anthropic',
          data: {
            function: 'anthropic_stream_error',
          },
        },
        data: {
          function: 'anthropic_stream_error',
        },
      });
      return true;
    }

    if (recordOutputs && event.type === 'content_block_delta') {
      const text = event.delta?.text ?? '';
      if (text) state.responseTexts.push(text);
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
    state.eventTypes.push('unknown:non-object');
    return;
  }

  const isError = isErrorEvent(event, state, recordOutputs, span);
  if (isError) return;

  handleMessageMetadata(event, state);
}

/**
 * Instruments an async iterable stream of Anthropic events, updates the span with
 * streaming attributes and (optionally) the aggregated output text, and yields
 * each event from the input stream unchanged.
 */
export async function* instrumentStream(
  stream: AsyncIterable<AnthropicAiStreamingEvent>,
  span: Span,
  recordOutputs: boolean,
): AsyncGenerator<AnthropicAiStreamingEvent, void, unknown> {
  const state: StreamingState = {
    eventTypes: [],
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    responseTimestamp: 0,
    promptTokens: undefined,
    completionTokens: undefined,
    cacheCreationInputTokens: undefined,
    cacheReadInputTokens: undefined,
  };

  try {
    for await (const event of stream) {
      processEvent(event, state, recordOutputs, span);
      yield event;
    }
  } finally {
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
    if (state.responseTimestamp) {
      span.setAttributes({
        [ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE]: new Date(state.responseTimestamp * 1000).toISOString(),
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

    span.end();
  }
}
