import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  OPENAI_RESPONSE_STREAM_ATTRIBUTE,
} from '../gen-ai-attributes';
import { RESPONSE_EVENT_TYPES } from './constants';
import type { OpenAIResponseObject } from './types';
import { type ChatCompletionChunk, type ResponseStreamingEvent } from './types';
import {
  isChatCompletionChunk,
  isResponsesApiStreamEvent,
  setCommonResponseAttributes,
  setTokenUsageAttributes,
} from './utils';

/**
 * State object used to accumulate information from a stream of OpenAI events/chunks.
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
  /** Total number of tokens used (prompt + completion). */
  totalTokens: number | undefined;
}

/**
 * Processes a single OpenAI ChatCompletionChunk event, updating the streaming state.
 *
 * @param chunk - The ChatCompletionChunk event to process.
 * @param state - The current streaming state to update.
 * @param recordOutputs - Whether to record output text fragments.
 */
function processChatCompletionChunk(chunk: ChatCompletionChunk, state: StreamingState, recordOutputs: boolean): void {
  state.responseId = chunk.id ?? state.responseId;
  state.responseModel = chunk.model ?? state.responseModel;
  state.responseTimestamp = chunk.created ?? state.responseTimestamp;

  if (chunk.usage) {
    // For stream responses, the input tokens remain constant across all events in the stream.
    // Output tokens, however, are only finalized in the last event.
    // Since we can't guarantee that the last event will include usage data or even be a typed event,
    // we update the output token values on every event that includes them.
    // This ensures that output token usage is always set, even if the final event lacks it.
    state.promptTokens = chunk.usage.prompt_tokens;
    state.completionTokens = chunk.usage.completion_tokens;
    state.totalTokens = chunk.usage.total_tokens;
  }

  for (const choice of chunk.choices ?? []) {
    if (recordOutputs && choice.delta?.content) {
      state.responseTexts.push(choice.delta.content);
    }
    if (choice.finish_reason) {
      state.finishReasons.push(choice.finish_reason);
    }
  }
}

/**
 * Processes a single OpenAI Responses API streaming event, updating the streaming state and span.
 *
 * @param streamEvent - The event to process (may be an error or unknown object).
 * @param state - The current streaming state to update.
 * @param recordOutputs - Whether to record output text fragments.
 * @param span - The span to update with error status if needed.
 */
function processResponsesApiEvent(
  streamEvent: ResponseStreamingEvent | unknown | Error,
  state: StreamingState,
  recordOutputs: boolean,
  span: Span,
): void {
  if (!(streamEvent && typeof streamEvent === 'object')) {
    state.eventTypes.push('unknown:non-object');
    return;
  }
  if (streamEvent instanceof Error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    captureException(streamEvent, {
      mechanism: {
        handled: false,
        type: 'openai',
      },
    });
    return;
  }

  if (!('type' in streamEvent)) return;
  const event = streamEvent as ResponseStreamingEvent;

  if (!RESPONSE_EVENT_TYPES.includes(event.type)) {
    state.eventTypes.push(event.type);
    return;
  }

  if (recordOutputs && event.type === 'response.output_text.delta' && 'delta' in event && event.delta) {
    state.responseTexts.push(event.delta);
    return;
  }

  if ('response' in event) {
    const { response } = event as { response: OpenAIResponseObject };
    state.responseId = response.id ?? state.responseId;
    state.responseModel = response.model ?? state.responseModel;
    state.responseTimestamp = response.created_at ?? state.responseTimestamp;

    if (response.usage) {
      // For stream responses, the input tokens remain constant across all events in the stream.
      // Output tokens, however, are only finalized in the last event.
      // Since we can't guarantee that the last event will include usage data or even be a typed event,
      // we update the output token values on every event that includes them.
      // This ensures that output token usage is always set, even if the final event lacks it.
      state.promptTokens = response.usage.input_tokens;
      state.completionTokens = response.usage.output_tokens;
      state.totalTokens = response.usage.total_tokens;
    }

    if (response.status) {
      state.finishReasons.push(response.status);
    }

    if (recordOutputs && response.output_text) {
      state.responseTexts.push(response.output_text);
    }
  }
}

/**
 * Instruments a stream of OpenAI events, updating the provided span with relevant attributes and
 * optionally recording output text. This function yields each event from the input stream as it is processed.
 *
 * @template T - The type of events in the stream.
 * @param stream - The async iterable stream of events to instrument.
 * @param span - The span to add attributes to and to finish at the end of the stream.
 * @param recordOutputs - Whether to record output text fragments in the span.
 * @returns An async generator yielding each event from the input stream.
 */
export async function* instrumentStream<T>(
  stream: AsyncIterable<T>,
  span: Span,
  recordOutputs: boolean,
): AsyncGenerator<T, void, unknown> {
  const state: StreamingState = {
    eventTypes: [],
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    responseTimestamp: 0,
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
  };

  try {
    for await (const event of stream) {
      if (isChatCompletionChunk(event)) {
        processChatCompletionChunk(event as ChatCompletionChunk, state, recordOutputs);
      } else if (isResponsesApiStreamEvent(event)) {
        processResponsesApiEvent(event as ResponseStreamingEvent, state, recordOutputs, span);
      }
      yield event;
    }
  } finally {
    setCommonResponseAttributes(span, state.responseId, state.responseModel, state.responseTimestamp);
    setTokenUsageAttributes(span, state.promptTokens, state.completionTokens, state.totalTokens);

    span.setAttributes({
      [OPENAI_RESPONSE_STREAM_ATTRIBUTE]: true,
    });

    if (state.finishReasons.length) {
      span.setAttributes({
        [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(state.finishReasons),
      });
    }

    if (recordOutputs && state.responseTexts.length) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: state.responseTexts.join(''),
      });
    }

    span.end();
  }
}
