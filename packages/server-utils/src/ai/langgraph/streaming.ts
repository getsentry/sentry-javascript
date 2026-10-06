import { SPAN_STATUS_ERROR, withActiveSpan } from '@sentry/core';
import type { Span } from '@sentry/core';
import type { LangChainMessage } from '../langchain/types';
import type { CompiledGraph } from './types';
import { setResponseAttributes } from './utils';

const graphInstrumentationIds = new WeakMap<CompiledGraph, number>();
let nextGraphInstrumentationId = 0;

export function getGraphInstrumentationId(graph: CompiledGraph): number {
  const existingId = graphInstrumentationIds.get(graph);
  if (existingId !== undefined) {
    return existingId;
  }

  const id = nextGraphInstrumentationId++;
  graphInstrumentationIds.set(graph, id);
  return id;
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return !!value && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}

export function instrumentStreamResult<T extends AsyncIterable<unknown>>(
  stream: T,
  span: Span,
  inputMessages: LangChainMessage[] | null,
  recordOutputs: boolean | undefined,
): T {
  const responseState: StreamResponseState = { updateMessages: [], messageChunks: [] };
  const lifecycle = createStreamLifecycle(
    span,
    recordOutputs ? chunk => accumulateStreamResponse(responseState, chunk) : undefined,
    recordOutputs
      ? () => setResponseAttributes(span, inputMessages, getStreamResponseResult(responseState, inputMessages))
      : undefined,
  );

  if (isReadableStream(stream)) {
    instrumentReadableStream(stream, span, lifecycle);
    return stream;
  }

  const iterate = stream[Symbol.asyncIterator].bind(stream);
  stream[Symbol.asyncIterator] = () => instrumentStreamIterator({ [Symbol.asyncIterator]: iterate }, span, lifecycle);
  return stream;
}

interface StreamLifecycle {
  recordChunk: (chunk: unknown) => void;
  complete: () => void;
  fail: () => void;
}

interface StreamResponseState {
  finalState?: { messages: LangChainMessage[] };
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
  pipeThrough?: (
    transform: ReadableWritablePair<unknown, unknown>,
    options?: StreamPipeOptions,
  ) => ReadableStream<unknown>;
  pipeTo?: (destination: WritableStream<unknown>, options?: StreamPipeOptions) => Promise<void>;
}

function createStreamLifecycle(
  span: Span,
  recordChunk?: (chunk: unknown) => void,
  completeResponse?: () => void,
): StreamLifecycle {
  let completed = false;

  const complete = (): void => {
    if (completed) {
      return;
    }

    completed = true;
    try {
      completeResponse?.();
    } finally {
      span.end();
    }
  };

  return {
    recordChunk(chunk: unknown): void {
      recordChunk?.(chunk);
    },
    complete,
    fail(): void {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      complete();
    },
  };
}

function accumulateStreamResponse(state: StreamResponseState, chunk: unknown): void {
  const payload =
    Array.isArray(chunk) && chunk.length === 2 && typeof chunk[0] === 'string' ? (chunk[1] as unknown) : chunk;
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
  const directState = getMessageState(payload);
  if (directState) {
    state.finalState = directState;
    return;
  }

  if (!payload || typeof payload !== 'object') {
    return;
  }

  for (const update of Object.values(payload)) {
    const updateState = getMessageState(update);
    if (updateState) {
      state.updateMessages.push(...updateState.messages);
    }
  }
}

function getMessageState(value: unknown): { messages: LangChainMessage[] } | undefined {
  if (!value || typeof value !== 'object' || !('messages' in value) || !Array.isArray(value.messages)) {
    return undefined;
  }

  return { messages: value.messages as LangChainMessage[] };
}

function getStreamResponseResult(
  state: StreamResponseState,
  inputMessages: LangChainMessage[] | null,
): { messages: LangChainMessage[] } | undefined {
  if (state.finalState) {
    return state.finalState;
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

function instrumentReadableStream(stream: InstrumentableReadableStream, span: Span, lifecycle: StreamLifecycle): void {
  const originalGetReader = stream.getReader.bind(stream);
  stream.getReader = (...args: unknown[]): ReadableStreamReaderLike => {
    const reader = withActiveSpan(span, () => originalGetReader(...args));
    return instrumentReader(reader, span, lifecycle);
  };

  if (stream.cancel) {
    const originalCancel = stream.cancel.bind(stream);
    stream.cancel = (reason?: unknown): Promise<void> =>
      stream.locked
        ? originalCancel(reason)
        : completeWithLifecycle(
            withActiveSpan(span, () => originalCancel(reason)),
            lifecycle,
          );
  }

  if (stream.pipeTo) {
    const originalPipeTo = stream.pipeTo.bind(stream);
    const instrumentedPipeTo = (destination: WritableStream<unknown>, options?: StreamPipeOptions): Promise<void> => {
      let destinationWriter: WritableStreamDefaultWriter<unknown>;
      try {
        if (stream.locked || destination.locked) {
          return Promise.reject(new TypeError('Cannot pipe to or from a locked stream.'));
        }
        destinationWriter = destination.getWriter();
      } catch (error) {
        return Promise.reject(error);
      }

      const recordingDestination = new WritableStream<unknown>({
        write(chunk) {
          lifecycle.recordChunk(chunk);
          return destinationWriter.write(chunk);
        },
        close() {
          return destinationWriter.close();
        },
        abort(reason) {
          return destinationWriter.abort(reason);
        },
      });

      let pipePromise: Promise<void>;
      try {
        pipePromise = withActiveSpan(span, () => originalPipeTo(recordingDestination, options));
      } catch (error) {
        destinationWriter.releaseLock();
        lifecycle.fail();
        return Promise.reject(error);
      }

      return completeWithLifecycle(pipePromise, lifecycle).finally(() => {
        destinationWriter.releaseLock();
      });
    };

    stream.pipeTo = instrumentedPipeTo;

    if (stream.pipeThrough) {
      stream.pipeThrough = (
        transform: ReadableWritablePair<unknown, unknown>,
        options?: StreamPipeOptions,
      ): ReadableStream<unknown> => {
        if (stream.locked || transform.writable.locked) {
          throw new TypeError('Cannot pipe through a locked stream.');
        }

        void instrumentedPipeTo(transform.writable, options).catch(error => {
          void transform.writable.abort(error).catch(() => {
            // The pipe may already have propagated the failure through the transform.
          });
        });
        return transform.readable;
      };
    }
  }
}

function instrumentReader(
  reader: ReadableStreamReaderLike,
  span: Span,
  lifecycle: StreamLifecycle,
): ReadableStreamReaderLike {
  const originalRead = reader.read.bind(reader);
  reader.read = (...args: unknown[]): Promise<ReadableStreamReadResult<unknown>> => {
    const readPromise: Promise<ReadableStreamReadResult<unknown>> = withActiveSpan(span, () => originalRead(...args));
    return readPromise.then(
      result => {
        if (result.done) {
          lifecycle.complete();
        } else {
          lifecycle.recordChunk(result.value);
        }
        return result;
      },
      error => {
        lifecycle.fail();
        throw error;
      },
    );
  };

  if (reader.cancel) {
    const originalCancel = reader.cancel.bind(reader);
    reader.cancel = (reason?: unknown): Promise<void> =>
      completeWithLifecycle(
        withActiveSpan(span, () => originalCancel(reason)),
        lifecycle,
      );
  }

  return reader;
}

function completeWithLifecycle<T>(promise: Promise<T>, lifecycle: StreamLifecycle): Promise<T> {
  return promise.then(
    result => {
      lifecycle.complete();
      return result;
    },
    error => {
      lifecycle.fail();
      throw error;
    },
  );
}

async function* instrumentStreamIterator(
  stream: AsyncIterable<unknown>,
  span: Span,
  lifecycle: StreamLifecycle,
): AsyncGenerator<unknown, void, unknown> {
  const iterator = stream[Symbol.asyncIterator]();
  let completed = false;

  try {
    while (true) {
      const result = await withActiveSpan(span, () => iterator.next());
      if (result.done) {
        completed = true;
        lifecycle.complete();
        return;
      }
      lifecycle.recordChunk(result.value);
      yield result.value;
    }
  } catch (error) {
    lifecycle.fail();
    throw error;
  } finally {
    try {
      if (!completed) {
        await withActiveSpan(span, () => iterator.return?.());
      }
    } finally {
      lifecycle.complete();
    }
  }
}
