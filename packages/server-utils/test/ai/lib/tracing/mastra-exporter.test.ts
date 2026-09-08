import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  getMainCarrier,
  setCurrentClient,
  spanToStaticSpanJSON,
} from '@sentry/core';
import { SentryMastraExporter } from '../../../../src/ai/mastra';
import type { MastraExportedSpan, MastraSpanType, MastraTracingEvent } from '../../../../src/ai/mastra/types';
import { OPENAI_INTEGRATION_NAME } from '../../../../src/ai/openai/constants';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function makeSpan(overrides: Partial<MastraExportedSpan> = {}): MastraExportedSpan {
  return {
    id: 'span-1',
    name: 'agent run',
    type: 'agent_run',
    startTime: new Date('2026-01-01T00:00:00Z'),
    endTime: new Date('2026-01-01T00:00:01Z'),
    ...overrides,
  };
}

function started(span: MastraExportedSpan): MastraTracingEvent {
  return { type: 'span_started', exportedSpan: span };
}

function ended(span: MastraExportedSpan): MastraTracingEvent {
  return { type: 'span_ended', exportedSpan: span };
}

describe('SentryMastraExporter', () => {
  let endedSpans: Span[];
  let exporter: SentryMastraExporter;

  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle: 'stream',
      }),
    );
    setCurrentClient(client);
    client.init();

    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
    exporter = new SentryMastraExporter();
  });

  afterEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getMainCarrier().__SENTRY__ = undefined;
  });

  async function run(...events: MastraTracingEvent[]): Promise<void> {
    for (const event of events) {
      await exporter.exportTracingEvent(event);
    }
  }

  // Mastra reaches providers through the fetch-based `@ai-sdk/*` packages, never through the
  // `openai` / `@anthropic-ai/sdk` / `@google/genai` clients those integrations patch. There is no
  // duplicate span to suppress, so skipping would only drop the app's own direct SDK calls.
  it('never skips raw provider wrapping', async () => {
    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

    await exporter.exportTracingEvent(started(makeSpan()));

    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);
  });

  it('names agent spans `invoke_agent {name}` and sets the gen_ai op', async () => {
    const span = makeSpan({ entityName: 'weather_agent' });
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe('invoke_agent weather_agent');
    expect(json.data['sentry.op']).toBe('gen_ai.invoke_agent');
    expect(json.data['sentry.origin']).toBe('auto.ai.mastra');
    expect(json.data['gen_ai.operation.name']).toBe('invoke_agent');
    expect(json.data['gen_ai.agent.name']).toBe('weather_agent');
    expect(json.data['gen_ai.pipeline.name']).toBe('weather_agent');
  });

  it('names generation spans `chat {model}` and maps usage to the current conventions', async () => {
    const span = makeSpan({
      id: 'gen-1',
      type: 'model_generation',
      name: 'generation',
      attributes: {
        model: 'gpt-5',
        provider: 'openai',
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          outputDetails: { reasoning: 3 },
          inputDetails: { cacheRead: 2, cacheWrite: 5 },
        },
      },
    });
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe('chat gpt-5');
    expect(json.data['sentry.op']).toBe('gen_ai.chat');
    expect(json.data['gen_ai.provider.name']).toBe('openai');
    expect(json.data['gen_ai.usage.input_tokens']).toBe(10);
    expect(json.data['gen_ai.usage.output_tokens']).toBe(4);
    expect(json.data['gen_ai.usage.total_tokens']).toBe(14);
    expect(json.data['gen_ai.usage.reasoning.output_tokens']).toBe(3);
    expect(json.data['gen_ai.usage.cache_read.input_tokens']).toBe(2);
    expect(json.data['gen_ai.usage.cache_creation.input_tokens']).toBe(5);
    expect(json.data['gen_ai.usage.reasoning_tokens']).toBeUndefined();
    expect(json.data['gen_ai.response.text']).toBeUndefined();
    expect(json.data['gen_ai.response.tool_calls']).toBeUndefined();
  });

  it('records the agent-level prompt and response as gen_ai messages', async () => {
    const span = makeSpan({
      entityName: 'agent',
      input: [{ role: 'user', content: 'hi' }],
      output: { text: 'hello' },
      attributes: { instructions: 'be brief' },
    });
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.data['gen_ai.input.messages']).toBe('[{"role":"user","content":"hi"}]');
    expect(json.data['gen_ai.output.messages']).toBe('{"text":"hello"}');
    expect(json.data['gen_ai.response.text']).toBe('hello');
    expect(json.data['gen_ai.system_instructions']).toBe('be brief');
  });

  it.each([
    ['a string output', 'hello', 'hello'],
    ['a `{ text }` output', { text: 'hello' }, 'hello'],
  ] as const)('sets gen_ai.response.text from %s on a generation span', async (_label, output, expected) => {
    const span = makeSpan({
      id: 'gen-text',
      type: 'model_generation',
      name: 'generation',
      output,
      attributes: { model: 'gpt-5' },
    });
    await run(started(span), ended(span));

    expect(spanToStaticSpanJSON(endedSpans[0]!).data['gen_ai.response.text']).toBe(expected);
  });

  it.each([
    [
      'workflow_run',
      { type: 'workflow_run' as const, entityName: 'math_workflow' },
      'invoke_agent math_workflow',
      'gen_ai.invoke_agent',
    ],
    [
      'rag_embedding',
      { type: 'rag_embedding' as const, attributes: { model: 'text-embedding-3' } },
      'embeddings text-embedding-3',
      'gen_ai.embeddings',
    ],
    [
      'mcp_tool_call',
      { type: 'mcp_tool_call' as const, entityName: 'search' },
      'execute_tool search',
      'gen_ai.execute_tool',
    ],
    ['entityId when entityName is missing', { entityId: 'agent-42' }, 'invoke_agent agent-42', 'gen_ai.invoke_agent'],
  ])('names a %s span', async (_label, overrides, description, op) => {
    const span = makeSpan(overrides);
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe(description);
    expect(json.data['sentry.op']).toBe(op);
  });

  it('omits inputs and outputs when recording is disabled', async () => {
    exporter = new SentryMastraExporter({ recordInputs: false, recordOutputs: false });
    const span = makeSpan({ entityName: 'agent', input: { secret: 'pii' }, output: { text: 'pii' } });
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.data['gen_ai.input.messages']).toBeUndefined();
    expect(json.data['gen_ai.output.messages']).toBeUndefined();
    expect(JSON.stringify(json.data)).not.toContain('pii');
  });

  it('re-parents a tool onto the generation across a dropped model_step', async () => {
    const agent = makeSpan({ id: 'agent-1', entityName: 'agent' });
    const gen = makeSpan({
      id: 'gen-1',
      type: 'model_generation',
      parentSpanId: 'agent-1',
      attributes: { model: 'gpt-5' },
    });
    const step = makeSpan({ id: 'step-1', type: 'model_step', parentSpanId: 'gen-1' });
    const tool = makeSpan({
      id: 'tool-1',
      type: 'tool_call',
      parentSpanId: 'step-1',
      entityName: 'get_weather',
      input: { city: 'Berlin' },
    });

    await run(
      started(agent),
      started(gen),
      started(step),
      started(tool),
      ended(tool),
      ended(step),
      ended(gen),
      ended(agent),
    );

    const json = endedSpans.map(span => spanToStaticSpanJSON(span));
    const toolJson = json.find(span => span.description === 'execute_tool get_weather');
    const chatJson = json.find(span => span.description === 'chat gpt-5');
    expect(toolJson).toBeDefined();
    expect(chatJson).toBeDefined();
    expect(toolJson!.data['sentry.op']).toBe('gen_ai.execute_tool');
    expect(toolJson!.data['gen_ai.tool.name']).toBe('get_weather');
    expect(toolJson!.data['gen_ai.tool.call.arguments']).toBe('{"city":"Berlin"}');
    expect(toolJson!.parent_span_id).toBe(chatJson!.span_id);
  });

  it('rolls model usage up onto the parent agent', async () => {
    const agent = makeSpan({ id: 'agent-1', entityName: 'agent' });
    const gen = makeSpan({
      id: 'gen-1',
      type: 'model_generation',
      parentSpanId: 'agent-1',
      attributes: {
        model: 'gpt-5',
        responseModel: 'gpt-5-2026',
        usage: { inputTokens: 10, outputTokens: 4 },
      },
    });

    await run(started(agent), started(gen), ended(gen), ended(agent));

    const agentJson = endedSpans
      .map(span => spanToStaticSpanJSON(span))
      .find(span => span.description === 'invoke_agent agent');
    expect(agentJson).toBeDefined();
    expect(agentJson!.data['gen_ai.usage.input_tokens']).toBe(10);
    expect(agentJson!.data['gen_ai.usage.output_tokens']).toBe(4);
    expect(agentJson!.data['gen_ai.usage.total_tokens']).toBe(14);
    expect(agentJson!.data['gen_ai.response.model']).toBe('gpt-5-2026');
  });

  it('sums usage across multiple generations onto the parent agent', async () => {
    const agent = makeSpan({ id: 'agent-1', entityName: 'agent' });
    const first = makeSpan({
      id: 'gen-1',
      type: 'model_generation',
      parentSpanId: 'agent-1',
      attributes: {
        model: 'gpt-5',
        usage: { inputTokens: 10, outputTokens: 4, inputDetails: { cacheRead: 2 } },
      },
    });
    const second = makeSpan({
      id: 'gen-2',
      type: 'model_generation',
      parentSpanId: 'agent-1',
      attributes: {
        model: 'gpt-5',
        responseModel: 'gpt-5-2026',
        usage: { inputTokens: 30, outputTokens: 8, inputDetails: { cacheRead: 1 } },
      },
    });

    await run(started(agent), started(first), ended(first), started(second), ended(second), ended(agent));

    const agentJson = endedSpans
      .map(span => spanToStaticSpanJSON(span))
      .find(span => span.description === 'invoke_agent agent');
    expect(agentJson).toBeDefined();
    expect(agentJson!.data['gen_ai.usage.input_tokens']).toBe(40);
    expect(agentJson!.data['gen_ai.usage.output_tokens']).toBe(12);
    expect(agentJson!.data['gen_ai.usage.total_tokens']).toBe(52);
    expect(agentJson!.data['gen_ai.usage.cache_read.input_tokens']).toBe(3);
    expect(agentJson!.data['gen_ai.response.model']).toBe('gpt-5-2026');
  });

  it('marks the span errored without capturing a reconstructed exception', async () => {
    const span = makeSpan({ errorInfo: { message: 'boom', name: 'ToolError' } });
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.status).toBe('internal_error');
    expect(json.data['error.type']).toBe('ToolError');
  });

  it.each([
    ['model_chunk'],
    ['model_step'],
    ['model_inference'],
    ['workflow_step'],
    ['memory_operation'],
    ['processor_run'],
    ['scorer_run'],
    ['generic'],
    ['some_future_span_type'],
  ])('drops %s spans, which have no conventional gen_ai op', async spanType => {
    const span = makeSpan({ id: 'x-1', type: spanType, name: spanType });
    await run(started(span), ended(span));

    expect(endedSpans).toHaveLength(0);
  });

  it('drops event spans, which have no duration', async () => {
    const span = makeSpan({ isEvent: true, entityName: 'agent' });
    await run(started(span), ended(span));

    expect(endedSpans).toHaveLength(0);
  });

  it('emits only conventional attributes', async () => {
    const span = makeSpan({
      entityName: 'agent',
      metadata: { threadId: 'thread-9' },
    });
    await run(started(span), ended(span));

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(Object.keys(json.data).filter(key => key.startsWith('mastra.'))).toEqual([]);
    expect(json.data['gen_ai.conversation.id']).toBe('thread-9');
  });

  it.each([
    [
      'conversationId over threadId',
      { attributes: { conversationId: 'conv-1' }, metadata: { threadId: 'thread-9', runId: 'run-3' } },
      'conv-1',
    ],
    ['threadId, ignoring runId', { metadata: { threadId: 'thread-9', runId: 'run-3' } }, 'thread-9'],
  ] as const)('sets gen_ai.conversation.id from %s', async (_label, overrides, expected) => {
    const span = makeSpan({ entityName: 'agent', ...overrides });
    await run(started(span), ended(span));

    expect(spanToStaticSpanJSON(endedSpans[0]!).data['gen_ai.conversation.id']).toBe(expected);
  });

  it('does not use runId as gen_ai.conversation.id', async () => {
    const span = makeSpan({ entityName: 'agent', metadata: { runId: 'run-3' } });
    await run(started(span), ended(span));

    expect(spanToStaticSpanJSON(endedSpans[0]!).data['gen_ai.conversation.id']).toBeUndefined();
  });

  it('falls back to the bare operation name when there is no identifier', async () => {
    const span = makeSpan({ id: 'gen-2', type: 'model_generation', name: 'mastra name', attributes: {} });
    await run(started(span), ended(span));

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat');
  });

  it('stays inert when no Sentry client is present', async () => {
    getMainCarrier().__SENTRY__ = undefined;
    const span = makeSpan();
    await expect(exporter.exportTracingEvent(started(span))).resolves.toBeUndefined();
  });

  it('does not hang on a cyclic parent chain of dropped spans', async () => {
    const a = makeSpan({ id: 'A', type: 'model_chunk', parentSpanId: 'B' });
    const b = makeSpan({ id: 'B', type: 'model_chunk', parentSpanId: 'A' });
    await run(started(a), started(b));

    const child = makeSpan({ id: 'child', entityName: 'agent', parentSpanId: 'A' });
    await run(started(child), ended(child));

    expect(endedSpans).toHaveLength(1);
    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('invoke_agent agent');
  });

  it('does not grow without bound when spans never end', async () => {
    for (let i = 0; i < 1_500; i++) {
      await run(started(makeSpan({ id: `never-ends-${i}`, entityName: 'agent' })));
    }

    const fresh = makeSpan({ id: 'fresh', entityName: 'agent' });
    await run(started(fresh), ended(fresh));
    expect(endedSpans.some(span => spanToStaticSpanJSON(span).description === 'invoke_agent agent')).toBe(true);
  });

  it('ends the oldest Sentry span when the tracking map evicts it', async () => {
    await run(started(makeSpan({ id: 'oldest', entityName: 'oldest' })));

    for (let i = 0; i < 1_000; i++) {
      await run(started(makeSpan({ id: `later-${i}`, entityName: 'agent' })));
    }

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['invoke_agent oldest']);
  });

  it('emits gen_ai.request.stop_sequences as a list, not a JSON string', async () => {
    const span = makeSpan({
      id: 'gen-stop',
      type: 'model_generation',
      attributes: { model: 'gpt-5', parameters: { stopSequences: ['\n\n', 'END'] } },
    });
    await run(started(span), ended(span));

    expect(spanToStaticSpanJSON(endedSpans[0]!).data['gen_ai.request.stop_sequences']).toEqual(['\n\n', 'END']);
  });

  // Parentless dropped spans used to be stored under a falsy sentinel that `LRUMap.remove` never
  // deleted, so they filled the map and evicted live mappings, breaking re-parenting.
  it('does not let ended parentless dropped spans evict a live re-parenting entry', async () => {
    const agent = makeSpan({ id: 'agent-1', entityName: 'agent' });
    const openStep = makeSpan({ id: 'step-1', type: 'model_step', parentSpanId: 'agent-1' });
    await run(started(agent), started(openStep));

    for (let i = 0; i < 1_500; i++) {
      const orphan = makeSpan({ id: `orphan-${i}`, type: 'model_chunk' });
      await run(started(orphan), ended(orphan));
    }

    const tool = makeSpan({ id: 'tool-1', type: 'tool_call', parentSpanId: 'step-1', entityName: 'get_weather' });
    await run(started(tool), ended(tool), ended(agent));

    const json = endedSpans.map(span => spanToStaticSpanJSON(span));
    const toolJson = json.find(span => span.description === 'execute_tool get_weather');
    const agentJson = json.find(span => span.description === 'invoke_agent agent');
    expect(toolJson).toBeDefined();
    expect(agentJson).toBeDefined();
    expect(toolJson!.parent_span_id).toBe(agentJson!.span_id);
  });

  it('ends the previous Sentry span when a span id starts twice', async () => {
    await run(started(makeSpan({ id: 'dup', entityName: 'first' })));
    const second = makeSpan({ id: 'dup', entityName: 'second' });
    await run(started(second), ended(second));

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual([
      'invoke_agent first',
      'invoke_agent second',
    ]);
  });

  it('drops span types that only exist on Object.prototype', async () => {
    const span = makeSpan({ id: 'proto-1', type: 'toString' as MastraSpanType, entityName: 'agent' });
    await run(started(span), ended(span));

    expect(endedSpans).toHaveLength(0);
  });
});
