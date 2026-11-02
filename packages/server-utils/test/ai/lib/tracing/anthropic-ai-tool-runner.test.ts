import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent, Span } from '@sentry/core';
import {
  continueTrace,
  conversationIdIntegration,
  getClient,
  getCurrentScope,
  getIsolationScope,
  getMainCarrier,
  getTraceData,
  setCurrentClient,
  spanToStaticSpanJSON,
  SentryNonRecordingSpan,
  setConversationId,
  startSpan,
  withActiveSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { instrumentAnthropicAiClient } from '../../../../src/ai/anthropic-ai';
import { instrumentEnvironmentWorker, instrumentSessionToolRunner } from '../../../../src/ai/anthropic-ai/tool-runner';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../../src/async-context';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../src/ai/core/gen-ai-attributes';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

type Tool = { name: string; description?: string; input_schema: object; run: (...args: unknown[]) => unknown };
type Params = { tools?: unknown[] };

function tool(name: string, run: (...args: unknown[]) => unknown): Tool {
  return { name, description: `${name} tool`, input_schema: { type: 'object' }, run };
}

// Mirrors the SDK runner: `params` reads the live params, `addTools()` keeps its tools out of them.
class FakeRunner {
  public added: unknown[] = [];
  public constructor(public params: Params) {}
  public addTools(...tools: unknown[]): void {
    this.added.push(...tools);
  }
  public setMessagesParams(paramsOrMutator: Params | ((prev: Params) => Params)): void {
    this.params = typeof paramsOrMutator === 'function' ? paramsOrMutator(this.params) : paramsOrMutator;
  }
}

type ToolCall = { name: string; id: string; input: unknown };
type WorkItem = { sessionId: string; tools: Tool[]; calls: ToolCall[] };

// Mirrors the SDK session runner: it keeps `opts.tools` as `tools`, passes the call event as both `toolUse` and
// `toolUseBlock`, starts the background loop that runs the tools on the first `next()`, and closes the tools last.
class FakeSessionRunner {
  public readonly tools: Tool[];
  public drained = false;
  private _consumed = false;
  public constructor(
    public readonly sessionId: string,
    private readonly _opts: { tools: Tool[]; calls?: ToolCall[] },
  ) {
    this.tools = _opts.tools;
  }
  public async dispatch(name: string, toolUse: { id: string; input: unknown }): Promise<{ isError: boolean }> {
    const tool = this.tools.find(t => t.name === name)!;
    try {
      await tool.run(toolUse.input, { toolUse, toolUseBlock: toolUse, signal: new AbortController().signal });
      return { isError: false };
    } catch {
      return { isError: true };
    }
  }
  public async *[Symbol.asyncIterator](): AsyncGenerator<{ name: string; isError: boolean }> {
    if (this._consumed) {
      throw new Error('Cannot iterate over a consumed SessionToolRunner');
    }
    this._consumed = true;
    const loop = (async () => {
      const results = [];
      for (const { name, ...toolUse } of this._opts.calls ?? []) {
        await new Promise(resolve => setTimeout(resolve, 1));
        results.push({ name, ...(await this.dispatch(name, toolUse)) });
      }
      return results;
    })();
    try {
      for (const result of await loop) {
        yield result;
      }
    } finally {
      await new Promise(resolve => setTimeout(resolve, 1));
      startSpan({ name: 'close tools', op: 'tool.close' }, () => undefined);
      this.drained = true;
    }
  }
}

// Mirrors the SDK worker: `run()` drives one runner per work item from a single loop, building each with
// `new SessionToolRunner()`, and makes its own calls, such as the lease heartbeat, in between.
class FakeEnvironmentWorker {
  public constructor(private readonly _items: WorkItem[]) {}
  public async run(): Promise<void> {
    for (const { sessionId, ...opts } of this._items) {
      startSpan({ name: 'POST /v1/environments/work/heartbeat', op: 'http.client' }, () => undefined);
      const runner = new FakeSessionRunner(sessionId, opts);
      // What the `SessionToolRunner` constructor hook does.
      instrumentSessionToolRunner(runner, {});
      for await (const _call of runner) {
      }
    }
  }
}

function fakeClient() {
  return {
    beta: {
      sessions: {
        events: {
          toolRunner: vi.fn(
            (sessionId: string, opts: { tools: Tool[]; calls?: ToolCall[] }) => new FakeSessionRunner(sessionId, opts),
          ),
        },
      },
      messages: {
        create: vi.fn(),
        toolRunner: vi.fn((params: Params) => {
          if (!params) {
            throw new TypeError('params required');
          }
          return new FakeRunner(params);
        }),
      },
    },
  };
}

describe('instrumentAnthropicAiClient tool runner', () => {
  let endedSpans: Span[];
  let events: ErrorEvent[];

  function initClient(options: { tracesSampleRate?: number } = {}): void {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        integrations: [conversationIdIntegration()],
        beforeSend: event => {
          events.push(event);
          return null;
        },
        ...options,
      }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
  }

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    endedSpans = [];
    events = [];
    initClient({ tracesSampleRate: 1 });
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function spansWithOp(op: string) {
    return endedSpans.map(span => spanToStaticSpanJSON(span)).filter(span => span.op === op);
  }

  const toolSpans = () => spansWithOp(GEN_AI_EXECUTE_TOOL);
  const agentSpans = () => spansWithOp(GEN_AI_INVOKE_AGENT);

  it('wraps each tool call of the runner in an execute_tool span under the active span', async () => {
    const weather = tool('weather', async () => 'sunny');
    const serverTool = { type: 'web_search_20250305', name: 'web_search' };
    const serialized = JSON.stringify([weather, serverTool]);

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [weather, serverTool] });
    const parent = await startSpan({ name: 'agent' }, async span => {
      await weather.run({ city: 'Vienna' }, { toolUse: { id: 'toolu_1' } });
      return spanToStaticSpanJSON(span);
    });

    expect(JSON.stringify([weather, serverTool])).toBe(serialized);
    expect(toolSpans()).toEqual([
      expect.objectContaining({
        description: 'execute_tool weather',
        parent_span_id: parent.span_id,
        origin: 'auto.ai.anthropic',
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME]: 'execute_tool',
          [GEN_AI_TOOL_NAME]: 'weather',
          [GEN_AI_TOOL_DESCRIPTION]: 'weather tool',
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'toolu_1',
          [GEN_AI_TOOL_CALL_ARGUMENTS]: '{"city":"Vienna"}',
          [GEN_AI_TOOL_CALL_RESULT]: 'sunny',
        }),
      }),
    ]);
  });

  it('reads the call id from toolUseBlock on SDKs that pass only that', () => {
    const weather = tool('weather', () => 'sunny');

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [weather] });
    weather.run({}, { toolUseBlock: { id: 'toolu_old' } });

    expect(toolSpans()[0]!.data[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toBe('toolu_old');
  });

  it('leaves out the attributes a call does not have', () => {
    const bare = { name: 'bare', input_schema: {}, run: () => undefined };

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [bare] });
    bare.run({});

    const { data } = toolSpans()[0]!;
    for (const key of [GEN_AI_TOOL_DESCRIPTION, GEN_AI_TOOL_CALL_ID_ATTRIBUTE, GEN_AI_TOOL_CALL_RESULT]) {
      expect(data).not.toHaveProperty([key]);
    }
  });

  it('keeps a synchronous run synchronous', () => {
    const weather = tool('weather', () => 'sunny');

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [weather] });

    expect(weather.run({})).toBe('sunny');
    expect(toolSpans()).toHaveLength(1);
  });

  it.each([
    ['async', async () => Promise.reject(new Error('boom'))],
    [
      'sync',
      () => {
        throw new Error('boom');
      },
    ],
  ])('marks a failed %s tool call and captures the error the runner swallows', async (_, run) => {
    const explode = tool('explode', run);

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [explode] });
    await expect(async () => explode.run({}, { toolUse: { id: 'toolu_1' } })).rejects.toThrow('boom');

    expect(toolSpans()[0]!.status).toBe('internal_error');
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]!.exception?.values?.[0]).toMatchObject({
      value: 'boom',
      mechanism: { type: 'auto.ai.anthropic', handled: true },
    });
  });

  it('marks but does not capture a throw from a direct call, which reaches its caller', async () => {
    const explode = tool('explode', async () => {
      throw new Error('boom');
    });

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [explode] });
    await expect(explode.run({})).rejects.toThrow('boom');

    expect(toolSpans()[0]!.status).toBe('internal_error');
    expect(events).toHaveLength(0);
  });

  it('does not capture a ToolError or a call aborted by the runner', async () => {
    const toolError = Object.assign(new Error('bad input'), { name: 'ToolError' });
    const refuses = tool('refuses', async () => {
      throw toolError;
    });
    const aborted = tool('aborted', async () => {
      throw new Error('aborted');
    });

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [refuses, aborted] });
    await expect(refuses.run({}, { toolUse: { id: 'toolu_1' } })).rejects.toBe(toolError);
    await expect(aborted.run({}, { toolUse: { id: 'toolu_2' }, signal: AbortSignal.abort() })).rejects.toThrow(
      'aborted',
    );

    expect(toolSpans().map(span => span.status)).toEqual(['internal_error', 'cancelled']);
    expect(events).toHaveLength(0);
  });

  it('wraps tools added through addTools() and setMessagesParams()', () => {
    const added = tool('added', () => 'a');
    const fromParams = tool('fromParams', () => 'b');
    const fromMutator = tool('fromMutator', () => 'c');

    const runner = instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [] });
    runner.addTools(added);
    runner.setMessagesParams({ tools: [fromParams] });
    runner.setMessagesParams(prev => ({ ...prev, tools: [fromMutator] }));

    added.run({});
    fromParams.run({});
    fromMutator.run({});

    expect(toolSpans().map(span => span.description)).toEqual([
      'execute_tool added',
      'execute_tool fromParams',
      'execute_tool fromMutator',
    ]);
  });

  it('wraps a tool once when it is shared between runners or instrumented twice', () => {
    const weather = tool('weather', () => 'sunny');

    const instrumented = instrumentAnthropicAiClient(instrumentAnthropicAiClient(fakeClient()));
    instrumented.beta.messages.toolRunner({ tools: [weather] });
    instrumented.beta.messages.toolRunner({ tools: [weather] });
    weather.run({});

    expect(toolSpans()).toHaveLength(1);
  });

  it('leaves toolsets alone, since their run takes (ctx, toolUse)', async () => {
    const plainRun = vi.fn(async () => {
      throw new Error('aborted by user');
    });
    const plainToolset = { type: 'browser_toolset_20260801', run: plainRun };
    class ComputerToolset {
      public readonly type = 'computer_toolset_20260801';
      public readonly toolsetName = 'computer';
      public async run(): Promise<string[]> {
        return [];
      }
    }
    const classToolset = new ComputerToolset();
    const classRun = classToolset.run;

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [plainToolset, classToolset] });
    const toolUse = { id: 'toolu_1', name: 'navigate', toolset_name: 'browser', input: {} };
    await expect(plainToolset.run({ toolUse, signal: AbortSignal.abort() }, toolUse)).rejects.toThrow();
    await classToolset.run();

    expect(plainToolset.run).toBe(plainRun);
    expect(classToolset.run).toBe(classRun);
    expect(toolSpans()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('runs a frozen tool without a span', () => {
    const frozen = Object.freeze(tool('frozen', () => 'ok'));

    instrumentAnthropicAiClient(fakeClient()).beta.messages.toolRunner({ tools: [frozen] });

    expect(frozen.run({})).toBe('ok');
    expect(toolSpans()).toHaveLength(0);
  });

  it('passes a toolRunner() error through', () => {
    const instrumented = instrumentAnthropicAiClient(fakeClient());

    expect(() => instrumented.beta.messages.toolRunner(undefined as unknown as Params)).toThrow('params required');
  });

  describe('sessions.events.toolRunner()', () => {
    // The runner's tool calls run in a background loop, so their parent comes from the async context.
    beforeEach(() => {
      setAsyncLocalStorageAsyncContextStrategy();
    });

    it('wraps each tool call of the session runner in an execute_tool span', async () => {
      const weather = tool('weather', async () => 'sunny');

      const runner = instrumentAnthropicAiClient(fakeClient()).beta.sessions.events.toolRunner('sesn_1', {
        tools: [weather],
      });
      const parent = await startSpan({ name: 'agent' }, async span => {
        await runner.dispatch('weather', { id: 'sevt_1', input: { city: 'Vienna' } });
        return spanToStaticSpanJSON(span);
      });

      expect(toolSpans()).toEqual([
        expect.objectContaining({
          description: 'execute_tool weather',
          parent_span_id: parent.span_id,
          origin: 'auto.ai.anthropic',
          status: 'ok',
          data: expect.objectContaining({
            [GEN_AI_TOOL_NAME]: 'weather',
            [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'sevt_1',
          }),
        }),
      ]);
    });

    async function drain(runner: AsyncIterable<unknown>): Promise<void> {
      for await (const _call of runner) {
      }
    }

    function sessionRunner(sessionId: string, calls: ToolCall[]) {
      const tools = [
        tool('weather', async () => 'sunny'),
        tool('read', async () => '# Weather app'),
        tool('explode', async () => {
          throw new Error('disk full');
        }),
      ];
      return instrumentAnthropicAiClient(fakeClient()).beta.sessions.events.toolRunner(sessionId, { tools, calls });
    }

    it('parents the tool spans of each runner to its own invoke_agent span in its own trace, outside any span', async () => {
      const first = sessionRunner('sesn_vienna', [
        { name: 'weather', id: 'sevt_1', input: { city: 'Vienna' } },
        { name: 'read', id: 'sevt_2', input: { file_path: 'README.md' } },
      ]);
      const second = sessionRunner('sesn_graz', [{ name: 'weather', id: 'sevt_3', input: { city: 'Graz' } }]);

      await Promise.all([drain(first), drain(second)]);

      const agents = agentSpans();
      expect(agents).toHaveLength(2);
      for (const agent of agents) {
        expect(agent.parent_span_id).toBeUndefined();
      }
      expect(agents[0]!.trace_id).not.toBe(agents[1]!.trace_id);
      const vienna = agents.find(span => span.data[GEN_AI_CONVERSATION_ID] === 'sesn_vienna')!;
      const graz = agents.find(span => span.data[GEN_AI_CONVERSATION_ID] === 'sesn_graz')!;
      expect(
        toolSpans()
          .map(span => [span.data[GEN_AI_TOOL_CALL_ID_ATTRIBUTE], span.parent_span_id])
          .sort(),
      ).toEqual([
        ['sevt_1', vienna.span_id],
        ['sevt_2', vienna.span_id],
        ['sevt_3', graz.span_id],
      ]);
    });

    it('gives each tool span the session id of its runner, even for a tool shared between runners', async () => {
      const weather = tool('weather', async () => 'sunny');
      const client = instrumentAnthropicAiClient(fakeClient());

      await Promise.all([
        drain(
          client.beta.sessions.events.toolRunner('sesn_vienna', {
            tools: [weather],
            calls: [{ name: 'weather', id: 'sevt_1', input: {} }],
          }),
        ),
        drain(
          client.beta.sessions.events.toolRunner('sesn_graz', {
            tools: [weather],
            calls: [{ name: 'weather', id: 'sevt_2', input: {} }],
          }),
        ),
      ]);

      expect(
        toolSpans()
          .map(span => [span.data[GEN_AI_TOOL_CALL_ID_ATTRIBUTE], span.data[GEN_AI_CONVERSATION_ID]])
          .sort(),
      ).toEqual([
        ['sevt_1', 'sesn_vienna'],
        ['sevt_2', 'sesn_graz'],
      ]);
    });

    it.each([
      [
        'a scope',
        (run: () => Promise<void>) =>
          withScope(scope => {
            scope.setConversationId('conv_support_42');
            return run();
          }),
      ],
      [
        'Sentry.setConversationId()',
        (run: () => Promise<void>) =>
          withIsolationScope(() => {
            setConversationId('conv_support_42');
            return run();
          }),
      ],
    ])('keeps a conversation id set on %s on the runner and tool spans', async (_name, withConversationId) => {
      await withConversationId(() =>
        drain(sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }])),
      );

      expect(agentSpans()[0]!.data[GEN_AI_CONVERSATION_ID]).toBe('conv_support_42');
      expect(toolSpans()[0]!.data[GEN_AI_CONVERSATION_ID]).toBe('conv_support_42');
    });

    it('gives the runner span the invoke_agent op, name and session id', async () => {
      await drain(sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }]));

      expect(agentSpans()).toEqual([
        expect.objectContaining({
          description: 'invoke_agent',
          origin: 'auto.ai.anthropic',
          status: 'ok',
          data: expect.objectContaining({
            [GEN_AI_OPERATION_NAME]: 'invoke_agent',
            [GEN_AI_PROVIDER_NAME]: 'anthropic',
            [GEN_AI_CONVERSATION_ID]: 'sesn_vienna',
          }),
        }),
      ]);
    });

    it('nests the runner span under the active span', async () => {
      const parent = await startSpan({ name: 'handle work' }, async span => {
        await drain(sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }]));
        return spanToStaticSpanJSON(span);
      });

      expect(agentSpans()[0]!.parent_span_id).toBe(parent.span_id);
      expect(toolSpans()[0]!.parent_span_id).toBe(agentSpans()[0]!.span_id);
    });

    it('keeps the trace of an active span that is not sampled', async () => {
      const runner = sessionRunner('sesn_vienna', [{ name: 'explode', id: 'sevt_1', input: {} }]);
      const unsampled = new SentryNonRecordingSpan({ traceId: '4c3a5f2e8d9b1c7a6e5f4d3c2b1a0f9e' });

      await withActiveSpan(unsampled, () => drain(runner));

      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]!.contexts?.trace?.trace_id).toBe('4c3a5f2e8d9b1c7a6e5f4d3c2b1a0f9e');
      expect(agentSpans()).toEqual([]);
    });

    it('keeps the scope data of one session off the next outside any span', async () => {
      const tagging = tool('tagging', async () => getIsolationScope().setTag('customer', 'acme'));
      const explode = tool('explode', async () => {
        throw new Error('disk full');
      });
      const client = instrumentAnthropicAiClient(fakeClient());

      await drain(
        client.beta.sessions.events.toolRunner('sesn_acme', {
          tools: [tagging],
          calls: [{ name: 'tagging', id: 'sevt_1', input: {} }],
        }),
      );
      await drain(
        client.beta.sessions.events.toolRunner('sesn_globex', {
          tools: [explode],
          calls: [{ name: 'explode', id: 'sevt_2', input: {} }],
        }),
      );

      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]!.tags?.customer).toBeUndefined();
    });

    it('keeps the scope and trace of a request that has no span', async () => {
      const runner = sessionRunner('sesn_vienna', [{ name: 'explode', id: 'sevt_1', input: {} }]);

      const requestTraceId = await withIsolationScope(async scope => {
        scope.setTag('request', 'POST /work');
        await drain(runner);
        return getCurrentScope().getPropagationContext().traceId;
      });

      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]!.tags?.request).toBe('POST /work');
      expect(events[0]!.contexts?.trace?.trace_id).toBe(requestTraceId);
    });

    it('keeps a trace continued without a span', async () => {
      await continueTrace(
        { sentryTrace: '4c3a5f2e8d9b1c7a6e5f4d3c2b1a0f9e-8b5d36b773a00b34-1', baggage: undefined },
        () => drain(sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }])),
      );

      expect(agentSpans()[0]).toMatchObject({
        trace_id: '4c3a5f2e8d9b1c7a6e5f4d3c2b1a0f9e',
        parent_span_id: '8b5d36b773a00b34',
      });
    });

    it('sends the trace of each session with its requests when tracing is off', async () => {
      initClient();
      const sentTraceIds: string[] = [];
      const explode = tool('explode', async () => {
        sentTraceIds.push(getTraceData()['sentry-trace']!.split('-')[0]!);
        throw new Error('disk full');
      });
      const anthropic = instrumentAnthropicAiClient(fakeClient());

      await Promise.all(
        ['sesn_vienna', 'sesn_graz'].map(sessionId =>
          drain(
            anthropic.beta.sessions.events.toolRunner(sessionId, {
              tools: [explode],
              calls: [{ name: 'explode', id: `sevt_${sessionId}`, input: {} }],
            }),
          ),
        ),
      );

      await vi.waitFor(() => expect(events).toHaveLength(2));
      expect(new Set(sentTraceIds).size).toBe(2);
      expect(events.map(event => event.contexts?.trace?.trace_id).sort()).toEqual([...sentTraceIds].sort());
    });

    it('passes throw() on to the runner', async () => {
      const runner = sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }]);
      const iterator = runner[Symbol.asyncIterator]();
      await iterator.next();

      await expect(iterator.throw!(new Error('stop'))).rejects.toThrow('stop');

      expect(runner.drained).toBe(true);
    });

    describe('driven by an EnvironmentWorker', () => {
      function startWorker(items: WorkItem[]) {
        const worker = new FakeEnvironmentWorker(items);
        instrumentEnvironmentWorker(worker);
        return worker.run();
      }

      function twoSessions(): WorkItem[] {
        const weather = tool('weather', async () => 'sunny');
        return [
          { sessionId: 'sesn_vienna', tools: [weather], calls: [{ name: 'weather', id: 'sevt_1', input: {} }] },
          { sessionId: 'sesn_graz', tools: [weather], calls: [{ name: 'weather', id: 'sevt_2', input: {} }] },
        ];
      }

      it.each([
        ['a request span', (run: () => Promise<void>) => startSpan({ name: 'POST /workers/start' }, run)],
        ['an unsampled span', (run: () => Promise<void>) => withActiveSpan(new SentryNonRecordingSpan(), run)],
        ['a request scope without a span', (run: () => Promise<void>) => withIsolationScope(() => run())],
      ])('gives each session its own trace when the worker starts inside %s', async (_name, startInside) => {
        await startInside(() => startWorker(twoSessions()));

        const agents = agentSpans();
        expect(agents).toHaveLength(2);
        expect(agents.map(span => span.parent_span_id)).toEqual([undefined, undefined]);
        expect(agents[0]!.trace_id).not.toBe(agents[1]!.trace_id);
      });

      it('runs the calls of the worker loop apart from the request that started it', async () => {
        const request = await startSpan({ name: 'POST /workers/start' }, async span => {
          await startWorker(twoSessions());
          return spanToStaticSpanJSON(span);
        });

        const heartbeats = spansWithOp('http.client');
        expect(heartbeats).toHaveLength(2);
        expect(heartbeats.map(span => span.trace_id)).not.toContain(request.trace_id);
      });

      it('keeps the scope data of one session off the next', async () => {
        const tagging = tool('tagging', async () => getIsolationScope().setTag('customer', 'acme'));
        const explode = tool('explode', async () => {
          throw new Error('disk full');
        });

        await startWorker([
          { sessionId: 'sesn_acme', tools: [tagging], calls: [{ name: 'tagging', id: 'sevt_1', input: {} }] },
          { sessionId: 'sesn_globex', tools: [explode], calls: [{ name: 'explode', id: 'sevt_2', input: {} }] },
        ]);

        await vi.waitFor(() => expect(events).toHaveLength(1));
        expect(events[0]!.tags?.customer).toBeUndefined();
      });

      it('gives the tool spans the session id, not the conversation id of the request that started the worker', async () => {
        await withIsolationScope(scope => {
          scope.setConversationId('chat_1');
          return startWorker(twoSessions());
        });

        expect(
          toolSpans()
            .map(span => span.data[GEN_AI_CONVERSATION_ID])
            .sort(),
        ).toEqual(['sesn_graz', 'sesn_vienna']);
      });
    });

    it('starts the runner span on the first next(), not when the iterator is created', async () => {
      const started: string[] = [];
      getClient()!.on('spanStart', span => started.push(spanToStaticSpanJSON(span).op!));
      const runner = sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }]);

      const iterator = runner[Symbol.asyncIterator]();
      expect(started).toEqual([]);

      await iterator.next();
      expect(started).toEqual([GEN_AI_INVOKE_AGENT, GEN_AI_EXECUTE_TOOL]);
    });

    it('drains the runner under its span, before ending it, when the loop is left early', async () => {
      const runner = sessionRunner('sesn_vienna', [
        { name: 'weather', id: 'sevt_1', input: {} },
        { name: 'read', id: 'sevt_2', input: {} },
      ]);

      const drainedWhenSpanEnded: boolean[] = [];
      getClient()!.on('spanEnd', span => {
        if (spanToStaticSpanJSON(span).op === GEN_AI_INVOKE_AGENT) {
          drainedWhenSpanEnded.push(runner.drained);
        }
      });

      for await (const _call of runner) {
        break;
      }

      expect(drainedWhenSpanEnded).toEqual([true]);
      expect(spansWithOp('tool.close')[0]!.parent_span_id).toBe(agentSpans()[0]!.span_id);
    });

    it('marks the runner span as failed and rethrows when the runner is iterated twice', async () => {
      const runner = sessionRunner('sesn_vienna', []);
      await drain(runner);

      await expect(drain(runner)).rejects.toThrow('Cannot iterate over a consumed SessionToolRunner');

      expect(agentSpans().map(span => span.status)).toEqual(['ok', 'internal_error']);
    });

    it('starts one runner span when the runner is instrumented twice', async () => {
      const runner = sessionRunner('sesn_vienna', [{ name: 'weather', id: 'sevt_1', input: {} }]);
      instrumentSessionToolRunner(runner, {});

      await drain(runner);

      expect(agentSpans()).toHaveLength(1);
    });

    it('iterates a runner it cannot patch without a runner span', async () => {
      const runner = Object.preventExtensions(new FakeSessionRunner('sesn_vienna', { tools: [], calls: [] }));

      instrumentSessionToolRunner(runner, {});
      await drain(runner);

      expect(agentSpans()).toEqual([]);
    });

    it('captures the error of a failing tool, which the session runner turns into a result', async () => {
      const explode = tool('explode', async () => {
        throw new Error('disk full');
      });

      const runner = instrumentAnthropicAiClient(fakeClient()).beta.sessions.events.toolRunner('sesn_1', {
        tools: [explode],
      });
      const outcome = await runner.dispatch('explode', { id: 'sevt_2', input: {} });

      expect(outcome).toEqual({ isError: true });
      expect(toolSpans()[0]!.status).toBe('internal_error');
      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]!.exception?.values?.[0]).toMatchObject({
        value: 'disk full',
        mechanism: { type: 'auto.ai.anthropic', handled: true },
      });
    });
  });
});
