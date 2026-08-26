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
  const responseState: StreamResponseState = { updateMessages: [] };
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
  const instrumented = instrumentStreamIterator({ [Symbol.asyncIterator]: iterate }, span, lifecycle);
  stream[Symbol.asyncIterator] = () => instrumented;
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
}

interface ReadableStreamReaderLike {
  read: (...args: unknown[]) => Promise<ReadableStreamReadResult<unknown>>;
  cancel?: (reason?: unknown) => Promise<void>;
}

interface InstrumentableReadableStream extends AsyncIterable<unknown> {
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

  if (state.updateMessages.length === 0) {
    return undefined;
  }

  return { messages: [...(inputMessages ?? []), ...state.updateMessages] };
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
      completeWithLifecycle(
        withActiveSpan(span, () => originalCancel(reason)),
        lifecycle,
      );
  }

  if (stream.pipeTo) {
    const originalPipeTo = stream.pipeTo.bind(stream);
    const originalPipeThrough = stream.pipeThrough?.bind(stream);
    stream.pipeTo = (destination: WritableStream<unknown>, options?: StreamPipeOptions): Promise<void> => {
      let pipePromise: Promise<void>;
      try {
        pipePromise = withActiveSpan(span, () => {
          if (!originalPipeThrough) {
            return originalPipeTo(destination, options);
          }

          const passthrough = new TransformStream<unknown, unknown>({
            transform(chunk, controller) {
              lifecycle.recordChunk(chunk);
              controller.enqueue(chunk);
            },
          });
          const outputStream: ReadableStream<unknown> = originalPipeThrough(passthrough);
          return outputStream.pipeTo(destination, options);
        });
      } catch (error) {
        lifecycle.fail();
        throw error;
      }

      return completeWithLifecycle(pipePromise, lifecycle);
    };
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
