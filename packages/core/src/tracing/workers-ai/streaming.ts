import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types/span';
import { endStreamSpan, type StreamResponseState } from '../ai/utils';
import { WORKERS_AI_ORIGIN } from './constants';
import type { WorkersAiUsage } from './types';

interface WorkersAiStreamChunk {
  response?: unknown;
  usage?: WorkersAiUsage;
  tool_calls?: unknown[];
}

/**
 * Parse a single SSE line (`data: {...}`) and accumulate its data into the streaming state.
 */
function processLine(line: string, state: StreamResponseState, recordOutputs: boolean): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return;
  }

  const data = trimmed.slice('data:'.length).trim();
  if (!data || data === '[DONE]') {
    return;
  }

  let parsed: WorkersAiStreamChunk;
  try {
    parsed = JSON.parse(data) as WorkersAiStreamChunk;
  } catch {
    return;
  }

  if (parsed.usage) {
    if (typeof parsed.usage.prompt_tokens === 'number') {
      state.promptTokens = parsed.usage.prompt_tokens;
    }
    if (typeof parsed.usage.completion_tokens === 'number') {
      state.completionTokens = parsed.usage.completion_tokens;
    }
    if (typeof parsed.usage.total_tokens === 'number') {
      state.totalTokens = parsed.usage.total_tokens;
    }
  }

  if (recordOutputs && typeof parsed.response === 'string') {
    state.responseTexts.push(parsed.response);
  }

  if (recordOutputs && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
    state.toolCalls.push(...parsed.tool_calls);
  }
}

/**
 * Wrap a Workers AI streaming response (a server-sent-events `ReadableStream`) so we can
 * accumulate the response text and token usage while passing the original bytes through untouched.
 *
 * The span is ended once the consumer finishes reading (or cancels) the stream.
 */
export function instrumentWorkersAiStream(
  stream: ReadableStream<Uint8Array>,
  span: Span,
  recordOutputs: boolean,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  const state: StreamResponseState = {
    responseId: '',
    responseModel: '',
    finishReasons: [],
    responseTexts: [],
    toolCalls: [],
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
  };

  let buffer = '';
  let spanEnded = false;

  const finish = (): void => {
    if (spanEnded) {
      return;
    }
    spanEnded = true;
    endStreamSpan(span, state, recordOutputs);
  };

  const flushBuffer = (isDone: boolean): void => {
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer unless the stream is done.
    buffer = isDone ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      processLine(line, state, recordOutputs);
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          buffer += decoder.decode();
          flushBuffer(true);
          finish();
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        flushBuffer(false);
        controller.enqueue(value);
      } catch (error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        captureException(error, {
          mechanism: { handled: false, type: `${WORKERS_AI_ORIGIN}.stream` },
        });
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      finish();
      await reader.cancel(reason);
    },
  });
}
