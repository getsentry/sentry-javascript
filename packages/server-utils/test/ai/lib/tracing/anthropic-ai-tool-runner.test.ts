import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent, Span } from '@sentry/core';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON, startSpan } from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL } from '@sentry/conventions/op';
import { instrumentAnthropicAiClient } from '../../../../src/ai/anthropic-ai';
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

// Mirrors the SDK session runner: it keeps `opts.tools` as `tools` and passes the call event as both `toolUse` and `toolUseBlock`.
class FakeSessionRunner {
  public readonly tools: Tool[];
  public constructor(opts: { tools: Tool[] }) {
    this.tools = opts.tools;
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
}

function fakeClient() {
  return {
    beta: {
      sessions: {
        events: {
          toolRunner: vi.fn((_sessionId: string, opts: { tools: Tool[] }) => new FakeSessionRunner(opts)),
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

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    endedSpans = [];
    events = [];
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        beforeSend: event => {
          events.push(event);
          return null;
        },
      }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function toolSpans() {
    return endedSpans.map(span => spanToStaticSpanJSON(span)).filter(span => span.op === GEN_AI_EXECUTE_TOOL);
  }

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
