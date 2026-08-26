import { SPAN_STATUS_ERROR, withActiveSpan } from '@sentry/core';
import type { Span } from '@sentry/core';
import type { CompiledGraph } from './types';

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

export function instrumentStreamResult<T extends AsyncIterable<unknown>>(stream: T, span: Span): T {
  const iterate = stream[Symbol.asyncIterator].bind(stream);
  const instrumented = instrumentStreamIterator({ [Symbol.asyncIterator]: iterate }, span);
  stream[Symbol.asyncIterator] = () => instrumented;
  return stream;
}

async function* instrumentStreamIterator(
  stream: AsyncIterable<unknown>,
  span: Span,
): AsyncGenerator<unknown, void, unknown> {
  const iterator = stream[Symbol.asyncIterator]();
  let completed = false;

  try {
    while (true) {
      const result = await withActiveSpan(span, () => iterator.next());
      if (result.done) {
        completed = true;
        return;
      }
      yield result.value;
    }
  } catch (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    throw error;
  } finally {
    try {
      if (!completed) {
        await withActiveSpan(span, () => iterator.return?.());
      }
    } finally {
      span.end();
    }
  }
}
