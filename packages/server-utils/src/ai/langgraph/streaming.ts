import { handleCallbackErrors, SPAN_STATUS_ERROR, withActiveSpan, withScope } from '@sentry/core';
import type { Scope, Span } from '@sentry/core';
import { readableFromReader } from '../core/utils';
import type { LangChainMessage } from '../langchain/types';
import { setResponseAttributes } from './utils';

export function instrumentStreamResult<T extends AsyncIterable<unknown>>(
  stream: T,
  span: Span,
  inputMessages: LangChainMessage[] | null,
  recordOutputs: boolean | undefined,
): T {
  // Captured once: entering it per chunk is cheaper than `withActiveSpan`, which forks a scope each call.
  const spanScope = withActiveSpan(span, scope => scope);
  const lifecycle = createStreamLifecycle(span, inputMessages, recordOutputs);

  try {
    if (isReadableStream(stream)) {
      instrumentReadableStream(stream, spanScope, lifecycle);
    } else {
      const iterate = stream[Symbol.asyncIterator].bind(stream);
      stream[Symbol.asyncIterator] = () => instrumentStreamIterator(iterate(), spanScope, lifecycle);
    }
  } catch {
    // An unpatchable stream (e.g. frozen) still belongs to the caller; only the span is lost.
    lifecycle.complete();
  }
  return stream;
}

interface StreamLifecycle {
  recordChunk: (chunk: unknown) => void;
  complete: () => void;
  fail: () => void;
  markCancelled: (cancelled: boolean) => void;
}

// Modes whose payloads carry the graph's output; `debug`, `tasks`, `checkpoints` and `custom` do not.
const OUTPUT_STREAM_MODES = new Set(['values', 'updates', 'messages']);

interface StreamResponseState {
  finalMessages?: LangChainMessage[];
  updateMessages: LangChainMessage[];
  messageChunks: LangChainMessage[];
}

interface ReadableStreamReaderLike {
  read: (...args: unknown[]) => Promise<ReadableStreamReadResult<unknown>>;
  cancel?: (reason?: unknown) => Promise<void>;
}

interface InstrumentableReadableStream extends AsyncIterable<unknown> {
  locked: boolean;
  getReader: (...args: unknown[]) => ReadableStreamReaderLike;
  cancel?: (reason?: unknown) => Promise<void>;
  tee?: () => [ReadableStream<unknown>, ReadableStream<unknown>];
  pipeThrough?: (
    transform: ReadableWritablePair<unknown, unknown>,
    options?: StreamPipeOptions,
  ) => ReadableStream<unknown>;
  pipeTo?: (destination: WritableStream<unknown>, options?: StreamPipeOptions) => Promise<void>;
}

function createStreamLifecycle(
  span: Span,
  inputMessages: LangChainMessage[] | null,
  recordOutputs: boolean | undefined,
): StreamLifecycle {
  let state: StreamResponseState | undefined = recordOutputs ? { updateMessages: [], messageChunks: [] } : undefined;
  let input = inputMessages;
  let completed = false;
  // LangGraph's cancel releases the reader under a pending read, which rejects; that is not a failed run.
  let cancelled = false;

  const complete = (): void => {
    if (completed) {
      return;
    }

    completed = true;
    try {
      if (state) {
        setResponseAttributes(span, input, getStreamResponseResult(state, input));
      }
    } catch {
      // Recording failures must not replace the application's stream outcome.
    } finally {
      // The caller may hold the stream long after it ends; don't keep every chunk alive with it.
      state = undefined;
      input = null;
      span.end();
    }
  };

  return {
    recordChunk(chunk: unknown): void {
      try {
        if (state) {
          accumulateStreamResponse(state, chunk);
        }
      } catch {
        // Same as `complete`: recording must never break the application's stream.
      }
    },
    complete,
    fail(): void {
      if (!cancelled && !completed) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      }
      complete();
    },
    markCancelled(value: boolean): void {
      cancelled = value;
    },
  };
}

// Multi-mode and `subgraphs` streams wrap payloads as `[mode, payload]`, `[namespace, payload]` or
// `[namespace, mode, payload]`. Only the root graph's output modes describe this span's response.
function getOutputPayload(chunk: unknown): { payload: unknown } | undefined {
  if (!Array.isArray(chunk) || (typeof chunk[0] !== 'string' && !Array.isArray(chunk[0]))) {
    return { payload: chunk };
  }

  const namespace = Array.isArray(chunk[0]) ? (chunk[0] as unknown[]) : [];
  const mode = chunk.length === 3 ? chunk[1] : chunk[0];
  if (namespace.length > 0 || !isOutputStreamMode(mode)) {
    return undefined;
  }

  return { payload: chunk[chunk.length - 1] };
}

/** False for a `streamMode` whose payloads are not the graph's output; non-strings are chunk shapes. */
export function isOutputStreamMode(mode: unknown): boolean {
  return typeof mode !== 'string' || OUTPUT_STREAM_MODES.has(mode);
}

function accumulateStreamResponse(state: StreamResponseState, chunk: unknown): void {
  const payload = getOutputPayload(chunk)?.payload;
  // `encoding: 'text/event-stream'` yields bytes; walking them would cost a lookup per byte for nothing.
  if (!payload || typeof payload !== 'object' || ArrayBuffer.isView(payload)) {
    return;
  }

  if (
    Array.isArray(payload) &&
    payload.length === 2 &&
    payload[0] &&
    typeof payload[0] === 'object' &&
    'content' in payload[0]
  ) {
    const message = payload[0] as LangChainMessage;
    const previousIndex =
      typeof message.id === 'string' ? state.messageChunks.findIndex(previous => previous.id === message.id) : -1;
    const previous = state.messageChunks[previousIndex];
    if (previous && typeof previous.concat === 'function') {
      state.messageChunks[previousIndex] = previous.concat(message) as LangChainMessage;
    } else if (previous && typeof previous.content === 'string' && typeof message.content === 'string') {
      state.messageChunks[previousIndex] = { ...previous, ...message, content: previous.content + message.content };
    } else {
      state.messageChunks.push(message);
    }
    return;
  }
  const directMessages = getMessages(payload);
  if (directMessages) {
    state.finalMessages = directMessages;
    return;
  }

  for (const update of Object.values(payload)) {
    state.updateMessages.push(...(getMessages(update) ?? []));
  }
}

function getMessages(value: unknown): LangChainMessage[] | undefined {
  if (!value || typeof value !== 'object' || !('messages' in value) || !Array.isArray(value.messages)) {
    return undefined;
  }

  return value.messages as LangChainMessage[];
}

function getStreamResponseResult(
  state: StreamResponseState,
  inputMessages: LangChainMessage[] | null,
): { messages: LangChainMessage[] } | undefined {
  if (state.finalMessages) {
    return { messages: state.finalMessages };
  }

  // Updates contain complete messages, including the same responses emitted as token chunks.
  const messages = state.updateMessages.length > 0 ? state.updateMessages : state.messageChunks;
  if (messages.length === 0) {
    return undefined;
  }

  return { messages: [...(inputMessages ?? []), ...messages] };
}

function isReadableStream(stream: AsyncIterable<unknown>): stream is InstrumentableReadableStream {
  return typeof (stream as Partial<InstrumentableReadableStream>).getReader === 'function';
}

function instrumentReadableStream(
  stream: InstrumentableReadableStream,
  scope: Scope,
  lifecycle: StreamLifecycle,
): void {
  const originalGetReader = stream.getReader.bind(stream);
  stream.getReader = (...args: unknown[]): ReadableStreamReaderLike => {
    const reader = withScope(scope, () => originalGetReader(...args));
    return instrumentReader(reader, scope, lifecycle);
  };

  if (stream.cancel) {
    const originalCancel = stream.cancel.bind(stream);
    stream.cancel = (reason?: unknown): Promise<void> => {
      // Marked up front because LangGraph's cancel can reject an in-flight read before the cancel settles.
      lifecycle.markCancelled(true);
      // A plain locked stream rejects the cancel and keeps streaming, so only a cancel that took effect ends it.
      const locked = stream.locked;
      return handleCallbackErrors(
        () => withScope(scope, () => originalCancel(reason)),
        () => {
          lifecycle.markCancelled(false);
          if (!locked) {
            lifecycle.fail();
          }
        },
        undefined,
        () => lifecycle.complete(),
      );
    };
  }

  // Native piping reads through internal slots, bypassing the patched `getReader`. The checks mirror
  // native piping's own, made before the reader is taken so a rejected pipe leaves the source unlocked.
  const instrumentedSource = (
    destination: WritableStream<unknown> | undefined,
    options: StreamPipeOptions | undefined,
    hasReadable = true,
  ): ReadableStream<unknown> => {
    const signal = options?.signal;
    if (
      stream.locked ||
      typeof destination?.getWriter !== 'function' ||
      destination.locked ||
      !hasReadable ||
      (signal !== undefined && !(signal instanceof AbortSignal))
    ) {
      throw new TypeError('Cannot pipe a locked stream, or with a missing or locked destination or an invalid signal.');
    }
    return readableFromReader(stream.getReader());
  };

  if (stream.tee) {
    stream.tee = () => readableFromReader(stream.getReader()).tee();
  }

  if (stream.pipeTo) {
    stream.pipeTo = async (destination: WritableStream<unknown>, options?: StreamPipeOptions): Promise<void> =>
      instrumentedSource(destination, options).pipeTo(destination, options);
  }

  if (stream.pipeThrough) {
    stream.pipeThrough = (
      transform: ReadableWritablePair<unknown, unknown>,
      options?: StreamPipeOptions,
    ): ReadableStream<unknown> =>
      instrumentedSource(transform?.writable, options, !!transform?.readable).pipeThrough(transform, options);
  }
}

function instrumentReader(
  reader: ReadableStreamReaderLike,
  scope: Scope,
  lifecycle: StreamLifecycle,
): ReadableStreamReaderLike {
  const originalRead = reader.read.bind(reader);
  reader.read = (...args: unknown[]): Promise<ReadableStreamReadResult<unknown>> =>
    handleCallbackErrors(
      () => withScope(scope, () => originalRead(...args)),
      () => lifecycle.fail(),
      undefined,
      (result: ReadableStreamReadResult<unknown>) =>
        result.done ? lifecycle.complete() : lifecycle.recordChunk(result.value),
    );

  if (reader.cancel) {
    const originalCancel = reader.cancel.bind(reader);
    reader.cancel = (reason?: unknown): Promise<void> => {
      lifecycle.markCancelled(true);
      return handleCallbackErrors(
        () => withScope(scope, () => originalCancel(reason)),
        () => {
          lifecycle.markCancelled(false);
          lifecycle.fail();
        },
        () => lifecycle.complete(),
      );
    };
  }

  return reader;
}

async function* instrumentStreamIterator(
  iterator: AsyncIterator<unknown>,
  scope: Scope,
  lifecycle: StreamLifecycle,
): AsyncGenerator<unknown, void, unknown> {
  // Like `for await`, only close the source when the consumer stops early, not after it threw or finished.
  let sourceDone = false;

  try {
    while (true) {
      let result: IteratorResult<unknown>;
      try {
        result = await withScope(scope, () => iterator.next());
      } catch (error) {
        sourceDone = true;
        lifecycle.fail();
        throw error;
      }
      if (result.done) {
        sourceDone = true;
        lifecycle.complete();
        return;
      }
      lifecycle.recordChunk(result.value);
      yield result.value;
    }
  } finally {
    try {
      if (!sourceDone) {
        await withScope(scope, () => iterator.return?.());
      }
    } finally {
      lifecycle.complete();
    }
  }
}
