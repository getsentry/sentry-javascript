import type { Span } from '@sentry/core';
import { endStreamSpan } from '../core/utils';
import type { MistralCompletionChunk } from './types';

/**
 * State accumulated while consuming a Mistral event stream.
 */
interface StreamingState {
  responseTexts: string[];
  finishReasons: string[];
  responseId: string;
  responseModel: string;
  promptTokens: number | undefined;
  completionTokens: number | undefined;
  totalTokens: number | undefined;
}

function processChunk(chunk: MistralCompletionChunk, state: StreamingState, recordOutputs: boolean): void {
  state.responseId = chunk.id ?? state.responseId;
  state.responseModel = chunk.model ?? state.responseModel;

  if (chunk.usage) {
    // Input tokens stay constant across the stream; output tokens are only finalized in the last
    // event, so we overwrite on every event that carries usage to guarantee the totals are set.
    state.promptTokens = chunk.usage.promptTokens;
    state.completionTokens = chunk.usage.completionTokens;
    state.totalTokens = chunk.usage.totalTokens;
  }

  for (const choice of chunk.choices ?? []) {
    if (recordOutputs && typeof choice.delta?.content === 'string' && choice.delta.content) {
      state.responseTexts.push(choice.delta.content);
    }
    if (choice.finishReason) {
      state.finishReasons.push(choice.finishReason);
    }
  }
}

/**
 * Instrument a Mistral event stream, accumulating response attributes and ending the span when
 * iteration finishes. Mistral yields `CompletionEvent` objects that wrap the chunk under `data`.
 */
export async function* instrumentStream<T>(
  stream: AsyncIterable<T>,
  span: Span,
  recordOutputs: boolean,
): AsyncGenerator<T, void, unknown> {
  const state: StreamingState = {
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
  };

  try {
    for await (const event of stream) {
      const chunk =
        event && typeof event === 'object' && 'data' in event
          ? (event as { data: MistralCompletionChunk }).data
          : (event as unknown as MistralCompletionChunk);
      if (chunk && typeof chunk === 'object') {
        processChunk(chunk, state, recordOutputs);
      }
      yield event;
    }
  } finally {
    endStreamSpan(span, { ...state, toolCalls: [] }, recordOutputs);
  }
}
