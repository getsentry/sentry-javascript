import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON, startSpan } from '@sentry/core';
import type { Span } from '@sentry/core';
import { GEN_AI_RESPONSE_STREAMING, GEN_AI_RESPONSE_TEXT } from '@sentry/conventions/attributes';
import { instrumentCompiledGraph } from '../../../../src/ai/langgraph';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

type Handler = Record<string, ((...args: unknown[]) => void) | undefined>;
type Emit = (event: string, ...args: unknown[]) => void;

// The parts of LangGraph's `IterableReadableStreamWithAbortSignal` the instrumentation relies on: the stream is
// its own async iterator, `return()` is what a `break` calls, and `cancel()` aborts `signal`.
function createStream(chunks: unknown[] = ['chunk']) {
  const controller = new AbortController();
  let index = 0;
  const stream = {
    signal: controller.signal,
    [Symbol.asyncIterator]() {
      return stream;
    },
    async next(): Promise<IteratorResult<unknown>> {
      return index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined };
    },
    return: vi.fn(async (): Promise<IteratorResult<unknown>> => ({ done: true, value: undefined })),
    cancel: vi.fn(async (): Promise<void> => controller.abort()),
  };
  return stream;
}

function getHandlers(callbacks: unknown): Handler[] {
  if (Array.isArray(callbacks)) {
    return callbacks as Handler[];
  }
  return ((callbacks as { handlers?: Handler[] } | undefined)?.handlers ?? []) as Handler[];
}

// A compiled graph whose `stream()` reports its root run to `config.callbacks` the way LangGraph does: the root
// run starts before `stream()` resolves, and ends or fails later.
function createGraph(run: (emit: Emit, input: unknown) => unknown) {
  return {
    async stream(input: unknown, config?: { callbacks?: unknown }): Promise<unknown> {
      const emit: Emit = (event, ...args) =>
        getHandlers(config?.callbacks).forEach(handler => handler[event]?.(...args));
      emit('handleChainStart', {}, input, 'root');
      return run(emit, input);
    },
  };
}

describe('LangGraph stream() agent span', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function instrument<T extends object>(graph: T, options = {}, sentryCallbackHandler?: unknown): T {
    instrumentCompiledGraph(graph, { name: 'weather_graph' }, options, undefined, sentryCallbackHandler);
    return graph;
  }

  const agentSpans = (): Span[] => endedSpans.filter(span => spanToStaticSpanJSON(span).op === 'gen_ai.invoke_agent');

  it('ends the span when the root run ends, not when a child run does', async () => {
    let emit!: Emit;
    const graph = instrument(
      createGraph(e => {
        emit = e;
        return createStream();
      }),
      { recordOutputs: true },
    );

    await graph.stream({ messages: [{ role: 'user', content: 'Weather?' }] });
    emit('handleChainStart', {}, {}, 'child', 'root');
    emit('handleChainEnd', {}, 'child', 'root');
    expect(agentSpans()).toHaveLength(0);

    emit(
      'handleChainEnd',
      {
        messages: [
          { role: 'user', content: 'Weather?' },
          { role: 'assistant', content: 'Sunny' },
        ],
      },
      'root',
    );

    expect(agentSpans()).toHaveLength(1);
    const span = spanToStaticSpanJSON(agentSpans()[0]!);
    expect(span.description).toBe('invoke_agent weather_graph');
    expect(span.status).not.toBe('internal_error');
    expect(span.data[GEN_AI_RESPONSE_STREAMING]).toBe(true);
    expect(span.data[GEN_AI_RESPONSE_TEXT]).toBe('[{"role":"assistant","content":"Sunny"}]');
  });

  it('ends the span when the run finishes although the stream is never read', async () => {
    const graph = instrument(
      createGraph(emit => {
        setTimeout(() => emit('handleChainEnd', {}, 'root'));
        return createStream();
      }),
    );

    await graph.stream({});
    await vi.waitFor(() => expect(agentSpans()).toHaveLength(1));
  });

  it('ends the span when the caller breaks out of the stream', async () => {
    const stream = createStream(['first', 'second']);
    const originalReturn = stream.return;
    const graph = instrument(createGraph(() => stream));

    for await (const _chunk of (await graph.stream({})) as AsyncIterable<unknown>) {
      break;
    }

    expect(originalReturn).toHaveBeenCalledTimes(1);
    expect(agentSpans()).toHaveLength(1);
    expect(spanToStaticSpanJSON(agentSpans()[0]!).status).not.toBe('internal_error');
  });

  it('passes a rejection from the original return() through to the caller', async () => {
    const error = new Error('return failed');
    const stream = createStream();
    stream.return.mockRejectedValueOnce(error);
    const graph = instrument(createGraph(() => stream));

    const consume = async (): Promise<void> => {
      for await (const _chunk of (await graph.stream({})) as AsyncIterable<unknown>) {
        break;
      }
    };

    await expect(consume()).rejects.toBe(error);
    expect(agentSpans()).toHaveLength(1);
  });

  it('treats a cancel by the caller as a finished run', async () => {
    let emit!: Emit;
    const graph = instrument(
      createGraph(e => {
        emit = e;
        return createStream();
      }),
    );

    const stream = (await graph.stream({})) as ReturnType<typeof createStream>;
    await stream.cancel();
    emit('handleChainError', new Error('Abort'), 'root');

    expect(agentSpans()).toHaveLength(1);
    expect(spanToStaticSpanJSON(agentSpans()[0]!).status).not.toBe('internal_error');
  });

  it('keeps the span open when cancel() is rejected, and still reports a later failure', async () => {
    let emit!: Emit;
    const graph = instrument(
      createGraph(e => {
        emit = e;
        const stream = createStream();
        stream.cancel.mockRejectedValueOnce(new TypeError('locked'));
        return stream;
      }),
    );

    const stream = (await graph.stream({})) as ReturnType<typeof createStream>;
    await expect(stream.cancel()).rejects.toThrow(TypeError);
    expect(agentSpans()).toHaveLength(0);

    emit('handleChainError', new Error('node failed'), 'root');
    expect(agentSpans()).toHaveLength(1);
    expect(spanToStaticSpanJSON(agentSpans()[0]!).status).toBe('internal_error');
  });

  it('does not mark an aborted run as failed when the caller aborted its own signal', async () => {
    const controller = new AbortController();
    const graph = instrument(
      createGraph(emit => {
        controller.abort();
        emit('handleChainError', new Error('Abort'), 'root');
        return createStream();
      }),
    );

    await graph.stream({}, { signal: controller.signal });

    expect(agentSpans()).toHaveLength(1);
    expect(spanToStaticSpanJSON(agentSpans()[0]!).status).not.toBe('internal_error');
  });

  it('marks the span failed and rethrows when stream() rejects', async () => {
    const error = new Error('bad input');
    const graph = instrument(
      createGraph(() => {
        throw error;
      }),
    );

    await expect(graph.stream({})).rejects.toBe(error);
    expect(agentSpans()).toHaveLength(1);
    expect(spanToStaticSpanJSON(agentSpans()[0]!).status).toBe('internal_error');
  });

  it('ends the span right away when stream() reports no run to follow', async () => {
    const graph = instrument({ stream: async () => createStream() });

    await graph.stream();

    expect(agentSpans()).toHaveLength(1);
  });

  it('still ends the span when recording the output fails', async () => {
    let emit!: Emit;
    const graph = instrument(
      createGraph(e => {
        emit = e;
        return createStream();
      }),
      { recordOutputs: true },
    );
    const outputs = {
      get messages(): never {
        throw new Error('unreadable state');
      },
    };

    await graph.stream({});
    expect(() => emit('handleChainEnd', outputs, 'root')).not.toThrow();
    expect(agentSpans()).toHaveLength(1);
  });

  it('does not add the per-call listener to the config object the caller passed', async () => {
    const callerHandler = { name: 'callerHandler' };
    const config = { callbacks: [callerHandler], metadata: { user: 'u' } };
    const graph = instrument(createGraph(() => createStream()));

    await graph.stream({}, config);

    expect(config).toEqual({ callbacks: [callerHandler], metadata: { user: 'u' } });
  });

  it('copies a callback manager instead of adding the listener to it', async () => {
    let received: unknown;
    const manager = {
      handlers: [] as unknown[],
      addHandler(handler: unknown) {
        this.handlers.push(handler);
      },
      copy() {
        return { ...manager, handlers: [...manager.handlers], addHandler: manager.addHandler, copy: manager.copy };
      },
    };
    const graph = instrument({
      async stream(_input: unknown, config: { callbacks: unknown }) {
        received = config.callbacks;
        return createStream();
      },
    });

    await graph.stream({}, { callbacks: manager });

    expect(manager.handlers).toHaveLength(0);
    expect(received).not.toBe(manager);
    expect((received as typeof manager).handlers).toHaveLength(1);
  });

  it('creates one span for invoke(), which streams internally', async () => {
    const graph = instrument({
      ...createGraph(emit => {
        emit('handleChainEnd', {}, 'root');
        return createStream();
      }),
      async invoke(this: { stream: (input: unknown) => Promise<unknown> }, input: unknown) {
        for await (const _chunk of (await this.stream(input)) as AsyncIterable<unknown>) {
          // drain, as LangGraph's invoke does
        }
        return {};
      },
    });

    await graph.invoke({});

    expect(agentSpans()).toHaveLength(1);
    expect(spanToStaticSpanJSON(agentSpans()[0]!).data[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
  });

  it('creates a child span for a stream() of the same graph started inside invoke()', async () => {
    const graph = instrument({
      ...createGraph(emit => {
        emit('handleChainEnd', {}, 'root');
        return createStream();
      }),
      async invoke(this: { stream: (input: unknown) => Promise<unknown> }, input: unknown) {
        await this.stream(input);
        await this.stream(input);
        return {};
      },
    });

    await graph.invoke({});

    const [streamSpan, invokeSpan] = agentSpans();
    expect(agentSpans()).toHaveLength(2);
    expect(spanToStaticSpanJSON(streamSpan!).parent_span_id).toBe(invokeSpan!.spanContext().spanId);
    expect(spanToStaticSpanJSON(streamSpan!).data[GEN_AI_RESPONSE_STREAMING]).toBe(true);
  });

  it('wraps a graph only once when it is instrumented twice', async () => {
    const graph = instrument(
      instrument(
        createGraph(emit => {
          emit('handleChainEnd', {}, 'root');
          return createStream();
        }),
      ),
    );

    await startSpan({ name: 'root' }, () => graph.stream({}));

    expect(agentSpans()).toHaveLength(1);
  });

  it('leaves the caller config untouched in invoke() and stream() when the Sentry handler is injected', async () => {
    const graph = instrument(
      {
        ...createGraph(emit => {
          emit('handleChainEnd', {}, 'root');
          return createStream();
        }),
        async invoke(
          this: { stream: (input: unknown, config: unknown) => Promise<unknown> },
          input: unknown,
          config: unknown,
        ) {
          await this.stream(input, config);
          return {};
        },
      },
      {},
      { name: 'SentryCallbackHandler' },
    );
    const config = { configurable: { thread_id: 't1' } };

    await graph.invoke({}, config);
    await graph.stream({}, config);

    expect(config).toEqual({ configurable: { thread_id: 't1' } });
  });
});
