import { captureException } from '../../exports';
import type { Span } from '../../types-hoist/span';
import { GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE, GEN_AI_RESPONSE_TEXT_ATTRIBUTE } from '../gen-ai-attributes';
import { RESPONSE_EVENT_TYPES } from './constants';
import type { OpenAIResponseObject } from './types';
import { type ChatCompletionChunk, type ResponseStreamingEvent } from './types';
import {
  isChatCompletionChunk,
  isResponsesApiStreamEvent,
  setCommonResponseAttributes,
  setTokenUsageAttributes,
} from './utils';

interface StreamingState {
  eventTypes: string[];
  responseTexts: string[];
  finishReasons: string[];
  responseId?: string;
  responseModel?: string;
  responseTimestamp?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

function processChatCompletionChunk(chunk: ChatCompletionChunk, state: StreamingState, recordOutputs: boolean): void {
  state.responseId = chunk.id ?? state.responseId;
  state.responseModel = chunk.model ?? state.responseModel;
  state.responseTimestamp = chunk.created ?? state.responseTimestamp;

  if (chunk.usage) {
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

function processResponsesApiEvent(
  streamEvent: ResponseStreamingEvent | unknown | Error,
  state: StreamingState,
  recordOutputs: boolean,
): void {
  if (!(streamEvent && typeof streamEvent === 'object')) {
    state.eventTypes.push('unknown:non-object');
    return;
  }
  if (streamEvent instanceof Error) {
    captureException(streamEvent);
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

  const { response } = event as { response: OpenAIResponseObject };
  state.responseId = response.id ?? state.responseId;
  state.responseModel = response.model ?? state.responseModel;
  state.responseTimestamp = response.created_at ?? state.responseTimestamp;

  if (response.usage) {
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
/**
 * Instrument a stream of OpenAI events
 * @param stream - The stream of events to instrument
 * @param span - The span to add attributes to
 * @param recordOutputs - Whether to record outputs
 * @param finishSpan - Optional function to finish the span manually
 * @returns A generator that yields the events
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
  };

  try {
    for await (const event of stream) {
      if (isChatCompletionChunk(event)) {
        processChatCompletionChunk(event as ChatCompletionChunk, state, recordOutputs);
      } else if (isResponsesApiStreamEvent(event)) {
        processResponsesApiEvent(event as ResponseStreamingEvent, state, recordOutputs);
      }
      yield event;
    }
  } finally {
    setCommonResponseAttributes(span, state.responseId, state.responseModel, state.responseTimestamp);
    setTokenUsageAttributes(span, state.promptTokens, state.completionTokens, state.totalTokens);

    if (state.finishReasons.length) {
      span.setAttributes({
        [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: state.finishReasons[state.finishReasons.length - 1],
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
