import type { Span } from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import { endStreamSpan, setOutputMessagesAttribute } from '../core/utils';
import type { MistralCompletionChunk, MistralToolCall } from './types';
import { contentToString } from './utils';

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
  /** Tool calls accumulated by their delta `index`; `function.arguments` arrives fragmented. */
  toolCalls: Record<number, MistralToolCall>;
}

/** Which drain path owns accumulation. See {@link instrumentEventStream}. */
type StreamConsumer = 'iterator' | 'reader';

type AsyncIterableStream = { [Symbol.asyncIterator]: () => AsyncIterator<unknown> };

interface StreamReaderLike {
  read: () => Promise<{ done: boolean; value?: unknown }>;
  cancel?: (reason?: unknown) => Promise<unknown>;
}

interface ReadableStreamLike {
  getReader?: (...args: unknown[]) => StreamReaderLike;
  cancel?: (reason?: unknown) => Promise<unknown>;
}

/** Whether a value can be drained with `for await`. */
export function isAsyncIterable(value: unknown): value is AsyncIterableStream {
  return !!value && typeof (value as AsyncIterableStream)[Symbol.asyncIterator] === 'function';
}

function createStreamingState(): StreamingState {
  return {
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
    toolCalls: {},
  };
}

function processToolCalls(toolCalls: MistralToolCall[], state: StreamingState): void {
  for (const toolCall of toolCalls) {
    const index = toolCall.index;
    if (index === undefined || !toolCall.function) {
      continue;
    }

    const existing = state.toolCalls[index];
    if (!existing) {
      state.toolCalls[index] = {
        ...toolCall,
        function: { name: toolCall.function.name, arguments: toolCall.function.arguments ?? '' },
      };
    } else if (toolCall.function.arguments && existing.function) {
      existing.function.arguments = `${existing.function.arguments}${toolCall.function.arguments}`;
    }
  }
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
    if (recordOutputs) {
      // Deltas carry either a plain string or the same content-chunk array the non-streaming
      // responses use, so both go through `contentToString`.
      const content = contentToString(choice.delta?.content);
      if (content) {
        state.responseTexts.push(content);
      }
      if (choice.delta?.toolCalls) {
        processToolCalls(choice.delta.toolCalls, state);
      }
    }
    if (choice.finishReason) {
      state.finishReasons.push(choice.finishReason);
    }
  }
}

/** Mistral yields `CompletionEvent` objects that wrap the chunk under `data`. */
function processEvent(event: unknown, state: StreamingState, recordOutputs: boolean): void {
  const chunk = (event as { data?: MistralCompletionChunk } | undefined)?.data;
  if (chunk && typeof chunk === 'object') {
    processChunk(chunk, state, recordOutputs);
  }
}

async function* instrumentIterator(
  iterate: () => AsyncIterator<unknown>,
  state: StreamingState,
  recordOutputs: boolean,
  claim: (consumer: StreamConsumer) => boolean,
  settle: (error?: unknown) => void,
): AsyncGenerator<unknown, void, unknown> {
  try {
    for await (const event of { [Symbol.asyncIterator]: iterate }) {
      if (claim('iterator')) {
        processEvent(event, state, recordOutputs);
      }
      yield event;
    }
  } catch (error) {
    settle(error);
    throw error;
  } finally {
    settle();
  }
}

function wrapReader(
  reader: StreamReaderLike,
  state: StreamingState,
  recordOutputs: boolean,
  claim: (consumer: StreamConsumer) => boolean,
  settle: (error?: unknown) => void,
  markCancelled: () => void,
): StreamReaderLike {
  // Captured before the proxy exists so the wrappers below call the real reader, not themselves.
  const originalRead = reader.read;
  const originalCancel = reader.cancel;
  const read = (): Promise<{ done: boolean; value?: unknown }> => originalRead.call(reader);
  const cancel =
    typeof originalCancel === 'function'
      ? (reason?: unknown): Promise<unknown> => originalCancel.call(reader, reason)
      : undefined;

  return new Proxy(reader, {
    get(target: StreamReaderLike, prop: string | symbol): unknown {
      if (prop === 'read') {
        return async (): Promise<{ done: boolean; value?: unknown }> => {
          try {
            const result = await read();
            if (result.done) {
              settle();
            } else if (claim('reader')) {
              processEvent(result.value, state, recordOutputs);
            }
            return result;
          } catch (error) {
            settle(error);
            throw error;
          }
        };
      }

      if (prop === 'cancel' && cancel) {
        return async (reason?: unknown): Promise<unknown> => {
          markCancelled();
          try {
            return await cancel(reason);
          } finally {
            settle();
          }
        };
      }

      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Instrument a Mistral event stream in place: accumulate response attributes as it is drained and
 * end `span` when it finishes.
 *
 * The stream is patched rather than replaced because `EventStream` extends `ReadableStream`, so
 * handing back a bare async generator would drop `getReader`, `tee`, `pipeTo` and the rest of the
 * `ReadableStream` API the caller is entitled to.
 *
 * Both `for await` and `getReader()` are valid ways to drain a `ReadableStream`, and the SDK's
 * iterator polyfill reads through `getReader()`, so both are wrapped. The first path to see a chunk
 * claims accumulation and the other stays a pass-through, which keeps a chunk from being counted
 * twice when one path drives the other.
 *
 * Returns `false` for a value that is not a stream, leaving it untouched.
 */
export function instrumentEventStream(stream: unknown, span: Span, recordOutputs: boolean): boolean {
  if (!isAsyncIterable(stream)) {
    return false;
  }

  const state = createStreamingState();
  let consumer: StreamConsumer | undefined;
  let settled = false;
  let cancelled = false;

  const claim = (candidate: StreamConsumer): boolean => {
    consumer ??= candidate;
    return consumer === candidate;
  };

  // Set synchronously when the caller asks to cancel, before the underlying cancel is awaited.
  // Cancelling can reject an in-flight `read()` (it aborts the HTTP body the stream reads from), and
  // that rejection would otherwise reach `settle` first and record a deliberate abort as a failure.
  const markCancelled = (): void => {
    cancelled = true;
  };

  const settle = (error?: unknown): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (error !== undefined && !cancelled) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    }

    const toolCalls = Object.values(state.toolCalls);

    if (recordOutputs) {
      // Set the authoritative `gen_ai.output.messages` alongside the deprecated response attributes
      // `endStreamSpan` writes, so tool calls survive Relay's lossy migration. A stream is a single
      // assistant turn, so the accumulated fragments make up one message.
      setOutputMessagesAttribute(span, {
        responseText: state.responseTexts.join(''),
        toolCalls,
        finishReason: state.finishReasons[0],
      });
    }

    endStreamSpan(span, { ...state, toolCalls }, recordOutputs);
  };

  const iterate = stream[Symbol.asyncIterator].bind(stream);
  const instrumented = instrumentIterator(iterate, state, recordOutputs, claim, settle);
  stream[Symbol.asyncIterator] = () => instrumented;

  const readable = stream as ReadableStreamLike;

  if (typeof readable.getReader === 'function') {
    const getReader = readable.getReader.bind(readable);
    readable.getReader = (...args: unknown[]) =>
      wrapReader(getReader(...args), state, recordOutputs, claim, settle, markCancelled);
  }

  if (typeof readable.cancel === 'function') {
    const cancel = readable.cancel.bind(readable);
    readable.cancel = async (reason?: unknown): Promise<unknown> => {
      markCancelled();
      try {
        return await cancel(reason);
      } finally {
        settle();
      }
    };
  }

  return true;
}
