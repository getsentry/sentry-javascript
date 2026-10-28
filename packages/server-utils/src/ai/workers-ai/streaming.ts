import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Span } from '@sentry/core';
import { endStreamSpan, type StreamResponseState } from '../core/utils';
import type { WorkersAiUsage } from './types';
import { setOutputMessagesAttribute } from './utils';

interface WorkersAiStreamingToolCall {
  index?: number | null;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
  // Some Workers AI models stream tool calls with the name/arguments at the top
  // level of the tool-call object instead of nested under `function`.
  name?: string;
  arguments?: string;
}

interface WorkersAiStreamChunk {
  // Native Workers AI streaming shape (`env.AI.run` with `stream: true`).
  response?: unknown;
  tool_calls?: unknown[];
  // OpenAI-compatible streaming shape emitted for models routed through the
  // OpenAI-compatible endpoint (e.g. via `workers-ai-provider`).
  choices?: Array<{
    delta?: { content?: unknown; tool_calls?: WorkersAiStreamingToolCall[] };
    finish_reason?: unknown;
  }>;
  usage?: WorkersAiUsage & { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * Tool calls accumulated from a stream: those that carry an `index` are keyed by it, those that don't
 * are kept in arrival order so they can never collide with a real index.
 */
interface ToolCallAccumulator {
  byIndex: Record<number, WorkersAiStreamingToolCall>;
  unindexed: WorkersAiStreamingToolCall[];
}

/**
 * Find the call a tool call delta without an `index` belongs to. Some providers omit the index and send each
 * parallel call whole in its own chunk: a delta with a known id continues that call, a new id (or a name without
 * an id) starts a new call, and anything else continues the latest one.
 */
function getUnindexedToolCall(
  toolCall: WorkersAiStreamingToolCall,
  name: string | undefined,
  accumulator: ToolCallAccumulator,
): WorkersAiStreamingToolCall | undefined {
  if (toolCall.id) {
    return accumulator.unindexed.find(call => call.id === toolCall.id);
  }
  return name ? undefined : accumulator.unindexed[accumulator.unindexed.length - 1];
}

/**
 * Accumulate a fragmented OpenAI-compatible tool call (delivered across multiple
 * `choices[].delta.tool_calls` chunks) into the accumulator.
 */
function accumulateStreamingToolCalls(toolCalls: WorkersAiStreamingToolCall[], accumulator: ToolCallAccumulator): void {
  for (const toolCall of toolCalls) {
    // Normalize both shapes: name/arguments nested under `function`, or at the top level.
    const name = toolCall.function?.name ?? toolCall.name;
    const args = toolCall.function?.arguments ?? toolCall.arguments;

    // A tool call must carry at least a name or argument fragment to be meaningful.
    if (name == null && args == null) {
      continue;
    }

    const existing =
      toolCall.index == null ? getUnindexedToolCall(toolCall, name, accumulator) : accumulator.byIndex[toolCall.index];

    if (!existing) {
      const created: WorkersAiStreamingToolCall = {
        index: toolCall.index ?? accumulator.unindexed.length,
        id: toolCall.id,
        type: toolCall.type,
        function: {
          name,
          arguments: args ?? '',
        },
      };
      if (toolCall.index == null) {
        accumulator.unindexed.push(created);
      } else {
        accumulator.byIndex[toolCall.index] = created;
      }
    } else if (existing.function) {
      if (name && !existing.function.name) {
        existing.function.name = name;
      }
      if (args) {
        existing.function.arguments = `${existing.function.arguments ?? ''}${args}`;
      }
    }
  }
}

/**
 * Parse a single SSE line (`data: {...}`) and accumulate its data into the streaming state.
 *
 * Handles both the native Workers AI shape (top-level `response`/`tool_calls`) and the
 * OpenAI-compatible shape (`choices[].delta.content`/`choices[].delta.tool_calls`), because
 * the same `run()` call transparently yields either format depending on the model.
 */
function processLine(
  line: string,
  state: StreamResponseState,
  recordOutputs: boolean,
  toolCallAccumulator: ToolCallAccumulator,
): void {
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

  if (Array.isArray(parsed.choices)) {
    for (const choice of parsed.choices) {
      if (recordOutputs && typeof choice.delta?.content === 'string' && choice.delta.content) {
        state.responseTexts.push(choice.delta.content);
      }
      if (recordOutputs && Array.isArray(choice.delta?.tool_calls)) {
        accumulateStreamingToolCalls(choice.delta.tool_calls, toolCallAccumulator);
      }
      if (typeof choice.finish_reason === 'string') {
        state.finishReasons.push(choice.finish_reason);
      }
    }
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

  // OpenAI-compatible tool calls arrive fragmented across chunks and are keyed by index;
  // accumulate them here and flatten into `state.toolCalls` once the stream ends.
  const toolCallAccumulator: ToolCallAccumulator = { byIndex: {}, unindexed: [] };

  let buffer = '';
  let spanEnded = false;

  const finish = (): void => {
    if (spanEnded) {
      return;
    }
    spanEnded = true;

    if (recordOutputs) {
      const accumulatedToolCalls = [...Object.values(toolCallAccumulator.byIndex), ...toolCallAccumulator.unindexed];
      if (accumulatedToolCalls.length > 0) {
        state.toolCalls.push(...accumulatedToolCalls);
      }

      // Set the authoritative `gen_ai.output.messages` alongside the deprecated response
      // attributes `endStreamSpan` writes, so tool calls survive Relay's lossy migration.
      setOutputMessagesAttribute(span, {
        responseText: state.responseTexts.join(''),
        toolCalls: state.toolCalls,
      });
    }

    endStreamSpan(span, state, recordOutputs);
  };

  const flushBuffer = (isDone: boolean): void => {
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer unless the stream is done.
    buffer = isDone ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      processLine(line, state, recordOutputs, toolCallAccumulator);
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
