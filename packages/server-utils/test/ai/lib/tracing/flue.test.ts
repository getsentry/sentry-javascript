import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Event, Span } from '@sentry/core';
import {
  getCurrentScope,
  getIsolationScope,
  getMainCarrier,
  Scope,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToStaticSpanJSON,
  startInactiveSpan,
  startSpan,
  withActiveSpan,
  withIsolationScope,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../../src/async-context';
import { createFlueInstrumentation } from '../../../../src/ai/flue';
import type { FlueInstrumentation } from '../../../../src/ai/flue/types';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const AGENT_OP = { type: 'agent', operationId: 'op_1' };
const AGENT_CTX = { agentName: 'Hello', submissionId: 'sub_1' };
const INNER_CTX = { conversationId: 'conv_1' };

describe('createFlueInstrumentation', () => {
  let endedSpans: Span[];
  let client: TestClient;
  let instrumentation: FlueInstrumentation;

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    client = new TestClient(
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
    instrumentation = createFlueInstrumentation();
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  /** Run `fn` inside an agent operation, the way Flue's interceptor would. */
  function withAgent<T>(fn: () => Promise<T> | T): Promise<T> {
    return instrumentation.interceptor(AGENT_OP, AGENT_CTX, async () => fn());
  }

  function agentSpans(): ReturnType<typeof spanToStaticSpanJSON>[] {
    return endedSpans
      .map(span => spanToStaticSpanJSON(span))
      .filter(json => json.data['sentry.op'] === 'gen_ai.invoke_agent');
  }

  function findSpan(description: string): ReturnType<typeof spanToStaticSpanJSON> | undefined {
    return endedSpans.map(span => spanToStaticSpanJSON(span)).find(json => json.description === description);
  }

  it('names agent spans `invoke_agent {name}` and sets the gen_ai op', async () => {
    await withAgent(() => undefined);

    const json = findSpan('invoke_agent Hello');
    expect(json?.data['sentry.op']).toBe('gen_ai.invoke_agent');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.operation.name']).toBe('invoke_agent');
    expect(json?.data['gen_ai.agent.name']).toBe('Hello');
  });

  // The agent span opens before the conversation is known — the submission-scoped operation names
  // the agent, and the conversation arrives on the observations that follow.
  it('sets the conversation id on the agent span from the observations', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'turn_start', operationId: 'op_1', conversationId: 'conv_1' }, {});
    });

    expect(findSpan('invoke_agent Hello')?.data['gen_ai.conversation.id']).toBe('conv_1');
  });

  // The re-entered agent operation carries no `submissionId` and must not open a second span.
  it('does not open a second agent span for the re-entry', async () => {
    await withAgent(() => instrumentation.interceptor(AGENT_OP, INNER_CTX, async () => undefined));

    const agentSpans = endedSpans
      .map(span => spanToStaticSpanJSON(span))
      .filter(json => json.data['sentry.op'] === 'gen_ai.invoke_agent');
    expect(agentSpans).toHaveLength(1);
  });

  // A durable submission is resumed later, with nothing linking it to the request that enqueued it.
  // Flue replays that request's `traceparent`, so the agent span should continue from it.
  describe('trace continuation', () => {
    const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const CARRIER = { traceparent: `00-${TRACE_ID}-bbbbbbbbbbbbbbbb-01` };

    function agentTraceId(): string | undefined {
      return endedSpans.map(span => spanToStaticSpanJSON(span)).find(json => json.description === 'invoke_agent Hello')
        ?.trace_id;
    }

    it('continues the trace from the replayed traceparent', async () => {
      await instrumentation.interceptor(AGENT_OP, { ...AGENT_CTX, traceCarrier: CARRIER }, async () => undefined);

      expect(agentTraceId()).toBe(TRACE_ID);
    });

    it('ignores a malformed traceparent', async () => {
      await instrumentation.interceptor(
        AGENT_OP,
        { ...AGENT_CTX, traceCarrier: { traceparent: 'not-a-traceparent' } },
        async () => undefined,
      );

      // Asserting a well-formed id, not just "not the carrier's": the span has to still be opened
      // on a fresh trace, and `not.toBe` alone would also pass if no span were opened at all.
      expect(agentTraceId()).toMatch(/^[0-9a-f]{32}$/);
      expect(agentTraceId()).not.toBe(TRACE_ID);
    });

    // An in-process dispatch is genuinely part of the surrounding trace; continuing the persisted
    // one would detach it from the request it is actually running inside.
    it('keeps the active trace when one is already running', async () => {
      let requestTraceId: string | undefined;

      await startSpan({ name: 'incoming request' }, async span => {
        requestTraceId = spanToStaticSpanJSON(span).trace_id;
        await instrumentation.interceptor(AGENT_OP, { ...AGENT_CTX, traceCarrier: CARRIER }, async () => undefined);
      });

      expect(agentTraceId()).toBe(requestTraceId);
    });
  });

  // On Node, Flue runs every submission from one claim loop that keeps the async context of the
  // call that started it, so the run has to be put back where it was admitted.
  describe('admission context', () => {
    const SUBMISSION_OP = { type: 'agent', operationId: 'sub_1' };

    function admit(): void {
      instrumentation.observe({ type: 'submission_queued', submissionId: 'sub_1' }, {});
    }

    /** Run the submission the way the claim loop does: wrapper first, then the spanned operation. */
    function runSubmission(): Promise<unknown> {
      return instrumentation.interceptor(SUBMISSION_OP, AGENT_CTX, () =>
        instrumentation.interceptor(AGENT_OP, AGENT_CTX, async () => undefined),
      );
    }

    it('parents the agent span to the span that admitted the submission, not the one the loop carries', async () => {
      const admitting = startInactiveSpan({ name: 'POST /agents/hello/b' });
      withActiveSpan(admitting, admit);

      await startSpan({ name: 'POST /agents/hello/a' }, () => runSubmission());

      const agent = findSpan('invoke_agent Hello');
      expect(agent?.trace_id).toBe(spanToStaticSpanJSON(admitting).trace_id);
      expect(agent?.parent_span_id).toBe(admitting.spanContext().spanId);
    });

    it('restores the isolation scope the submission was admitted in', async () => {
      // The default stack strategy ignores the scope it is handed.
      setAsyncLocalStorageAsyncContextStrategy();
      onTestFinished(() => setAsyncContextStrategy(undefined));

      const admittingScope = new Scope();
      withIsolationScope(admittingScope, admit);

      let runScope: Scope | undefined;
      await instrumentation.interceptor(SUBMISSION_OP, AGENT_CTX, async () => {
        runScope = getIsolationScope();
      });

      expect(runScope).toBe(admittingScope);
    });

    it('starts a new trace when nothing was active at admission', async () => {
      admit();

      let loopTraceId: string | undefined;
      await startSpan({ name: 'POST /agents/hello/a' }, span => {
        loopTraceId = spanToStaticSpanJSON(span).trace_id;
        return runSubmission();
      });

      const agent = findSpan('invoke_agent Hello');
      expect(agent?.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(agent?.trace_id).not.toBe(loopTraceId);
    });

    // Each Cloudflare turn runs from its own Durable Object alarm, which already starts a fresh trace.
    it('leaves the context alone on Cloudflare Workers', async () => {
      vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      withActiveSpan(startInactiveSpan({ name: 'POST /agents/hello/b' }), admit);

      let alarmSpanId: string | undefined;
      await startSpan({ name: 'alarm' }, span => {
        alarmSpanId = span.spanContext().spanId;
        return runSubmission();
      });

      expect(findSpan('invoke_agent Hello')?.parent_span_id).toBe(alarmSpanId);
    });

    // A submission admitted by another process, replayed by idempotency key, or already settled has
    // no record here, but the loop still carries the context of whichever request started it.
    it('drops the loop context when nothing was recorded for the submission', async () => {
      withActiveSpan(startInactiveSpan({ name: 'POST /agents/hello/b' }), admit);
      instrumentation.observe({ type: 'submission_settled', submissionId: 'sub_1' }, {});

      let loopTraceId: string | undefined;
      await startSpan({ name: 'POST /agents/hello/a' }, span => {
        loopTraceId = span.spanContext().traceId;
        return runSubmission();
      });

      const agent = findSpan('invoke_agent Hello');
      expect(agent?.parent_span_id).toBeUndefined();
      expect(agent?.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(agent?.trace_id).not.toBe(loopTraceId);
    });

    it('continues the replayed traceparent when nothing was recorded for the submission', async () => {
      const traceId = 'cccccccccccccccccccccccccccccccc';
      await startSpan({ name: 'POST /agents/hello/a' }, () =>
        instrumentation.interceptor(SUBMISSION_OP, AGENT_CTX, () =>
          instrumentation.interceptor(
            AGENT_OP,
            { ...AGENT_CTX, traceCarrier: { traceparent: `00-${traceId}-dddddddddddddddd-01` } },
            async () => undefined,
          ),
        ),
      );

      expect(findSpan('invoke_agent Hello')?.trace_id).toBe(traceId);
    });
  });

  // The spanned operation carries no `agentName` — only the submission wrapper does, and that opens
  // no span. The name arrives on the observations instead.
  it('names the agent span from the observations', async () => {
    await instrumentation.interceptor(AGENT_OP, {}, async () => {
      instrumentation.observe({ type: 'agent_start', operationId: 'op_1', agentName: 'Hello' }, {});
    });

    const json = findSpan('invoke_agent Hello');
    expect(json).toBeDefined();
    expect(json?.data['gen_ai.agent.name']).toBe('Hello');
  });

  // Delegation nests a second agent operation inside the first, in its own session. Flue defers
  // each to a microtask, so the helper mirrors that rather than calling the interceptor directly.
  describe('subagent delegation', () => {
    function runNested<T>(operationId: string, ctx: Record<string, unknown>, next: () => Promise<T>): Promise<T> {
      return Promise.resolve().then(() => instrumentation.interceptor({ type: 'agent', operationId }, ctx, next));
    }

    it('opens one agent span per invocation rather than folding the delegate into its parent', async () => {
      await runNested('op_parent', {}, async () => {
        instrumentation.observe({ type: 'agent_start', operationId: 'op_parent', conversationId: 'conv_parent' }, {});
        // The tool's task delegation, then the delegate's own prompt.
        return runNested('op_child', {}, async () => {
          instrumentation.observe({ type: 'agent_start', operationId: 'op_child', conversationId: 'conv_child' }, {});
        });
      });

      expect(agentSpans()).toHaveLength(2);
    });

    // Asserted on conversation rather than agent name: the observation stream reports the root
    // agent's name for both operations, so the delegate's own name never reaches us.
    it('keeps each invocation on its own conversation', async () => {
      await runNested('op_parent', {}, async () => {
        instrumentation.observe({ type: 'agent_start', operationId: 'op_parent', conversationId: 'conv_parent' }, {});
        return runNested('op_child', {}, async () => {
          instrumentation.observe({ type: 'agent_start', operationId: 'op_child', conversationId: 'conv_child' }, {});
        });
      });

      // The delegate ends first, so order is inner-to-outer.
      expect(agentSpans().map(json => json.data['gen_ai.conversation.id'])).toEqual(['conv_child', 'conv_parent']);
    });
  });

  it('does not span operations other than `agent`', async () => {
    await instrumentation.interceptor({ type: 'model' }, {}, async () => undefined);

    expect(endedSpans).toHaveLength(0);
  });

  // The model call's `gen_ai.chat` span comes from the pi-ai integration, which reads the
  // conversation from the scope.
  it('hands the conversation to the model operation it wraps through the scope', async () => {
    let conversationId: string | undefined;

    await withAgent(() =>
      instrumentation.interceptor({ type: 'model' }, INNER_CTX, async () => {
        conversationId = getCurrentScope().getScopeData().conversationId;
      }),
    );

    expect(conversationId).toBe('conv_1');
    expect(getCurrentScope().getScopeData().conversationId).toBeUndefined();
    expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['invoke_agent Hello']);
  });

  // The `tool` operation opens no span of its own; it makes the span `observe` already opened
  // active, so the tool's own work nests inside it rather than landing beside it as a sibling of
  // the agent invocation.

  it('makes the tool span active for the tool operation it wraps', async () => {
    await withAgent(async () => {
      instrumentation.observe(
        { type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' },
        {},
      );
      await instrumentation.interceptor({ type: 'tool', toolCallId: 'call_1' }, {}, async () => {
        startInactiveSpan({ name: 'tool work' }).end();
      });
      instrumentation.observe({ type: 'tool', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' }, {});
    });

    expect(findSpan('tool work')?.parent_span_id).toBe(findSpan('execute_tool get_weather')?.span_id);
  });

  describe('content recording', () => {
    async function record(instr: FlueInstrumentation): Promise<void> {
      await instr.interceptor(AGENT_OP, AGENT_CTX, async () => {
        instr.observe(
          {
            type: 'tool_start',
            toolCallId: 'c1',
            toolName: 'get_weather',
            args: { city: 'Berlin' },
            operationId: 'op_1',
          },
          {},
        );
        // `result` is the harness-level shape; `effectiveResult` is what the model receives.
        instr.observe(
          {
            type: 'tool',
            toolCallId: 'c1',
            toolName: 'get_weather',
            result: { content: [{ type: 'text', text: '"sunny"' }], details: { output: 'sunny' } },
            effectiveResult: 'sunny',
            operationId: 'op_1',
          },
          {},
        );
      });
    }

    it('records tool arguments and results by default', async () => {
      await record(instrumentation);

      const tool = findSpan('execute_tool get_weather');
      expect(tool?.data['gen_ai.tool.call.arguments']).toBe('{"city":"Berlin"}');
      expect(tool?.data['gen_ai.tool.call.result']).toBe('sunny');
    });

    it('records the content blocks of a tool result that has no effective result', async () => {
      await withAgent(() => {
        instrumentation.observe(
          { type: 'tool_start', toolCallId: 'c1', toolName: 'get_weather', operationId: 'op_1' },
          {},
        );
        instrumentation.observe(
          {
            type: 'tool',
            toolCallId: 'c1',
            toolName: 'get_weather',
            result: {
              content: [
                { type: 'text', text: 'sunny' },
                { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
              ],
              details: { customTool: 'get_weather' },
            },
            operationId: 'op_1',
          },
          {},
        );
      });

      expect(findSpan('execute_tool get_weather')?.data['gen_ai.tool.call.result']).toBe(
        '[{"type":"text","content":"sunny"},{"type":"blob","mime_type":"image/png"}]',
      );
    });

    it('maps an effective result made of several content blocks', async () => {
      await withAgent(() => {
        instrumentation.observe(
          { type: 'tool_start', toolCallId: 'c1', toolName: 'get_weather', operationId: 'op_1' },
          {},
        );
        instrumentation.observe(
          {
            type: 'tool',
            toolCallId: 'c1',
            toolName: 'get_weather',
            effectiveResult: [
              { type: 'text', text: 'sunny' },
              { type: 'image', data: '[image data omitted from event]', mimeType: 'image/png' },
            ],
            operationId: 'op_1',
          },
          {},
        );
      });

      expect(findSpan('execute_tool get_weather')?.data['gen_ai.tool.call.result']).toBe(
        '[{"type":"text","content":"sunny"},{"type":"blob","mime_type":"image/png"}]',
      );
    });

    it.each([
      ['an empty string', { effectiveResult: '' }],
      ['an empty text block', { effectiveResult: [{ type: 'text', text: '' }] }],
      ['no content blocks', { result: { content: [], details: {} } }],
    ])('records an empty tool result given as %s', async (_label, fields) => {
      await withAgent(() => {
        instrumentation.observe(
          { type: 'tool_start', toolCallId: 'c1', toolName: 'get_weather', operationId: 'op_1' },
          {},
        );
        instrumentation.observe(
          { type: 'tool', toolCallId: 'c1', toolName: 'get_weather', operationId: 'op_1', ...fields },
          {},
        );
      });

      expect(findSpan('execute_tool get_weather')?.data['gen_ai.tool.call.result']).toBe('');
    });

    it('omits inputs when recordInputs is false but keeps outputs', async () => {
      await record(createFlueInstrumentation({ recordInputs: false }));

      const tool = findSpan('execute_tool get_weather');
      expect(tool?.data['gen_ai.tool.call.arguments']).toBeUndefined();
      expect(tool?.data['gen_ai.tool.call.result']).toBeDefined();
    });

    // The client is replaced per request on Cloudflare, so options captured once at construction
    // would be the wrong ones for every later request.
    it('follows the current client when it is replaced', async () => {
      const instr = createFlueInstrumentation();
      await record(instr);
      expect(findSpan('execute_tool get_weather')?.data['gen_ai.tool.call.arguments']).toBeDefined();

      endedSpans.length = 0;
      const strict = new TestClient(
        getDefaultTestClientOptions({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          dataCollection: { genAI: { inputs: false, outputs: false } },
        }),
      );
      setCurrentClient(strict);
      strict.init();
      strict.on('spanEnd', span => endedSpans.push(span));

      await record(instr);

      const tool = findSpan('execute_tool get_weather');
      expect(tool).toBeDefined();
      expect(tool?.data['gen_ai.tool.call.arguments']).toBeUndefined();
    });

    it('omits outputs when recordOutputs is false but keeps inputs', async () => {
      await record(createFlueInstrumentation({ recordOutputs: false }));

      const tool = findSpan('execute_tool get_weather');
      expect(tool?.data['gen_ai.tool.call.result']).toBeUndefined();
      expect(tool?.data['gen_ai.tool.call.arguments']).toBeDefined();
    });
  });

  it('emits execute_tool spans keyed by tool call id', async () => {
    await withAgent(() => {
      instrumentation.observe(
        { type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' },
        {},
      );
      instrumentation.observe({ type: 'tool', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' }, {});
    });

    const json = findSpan('execute_tool get_weather');
    expect(json?.data['sentry.op']).toBe('gen_ai.execute_tool');
    expect(json?.data['sentry.origin']).toBe('auto.ai.flue');
    expect(json?.data['gen_ai.operation.name']).toBe('execute_tool');
    expect(json?.data['gen_ai.tool.name']).toBe('get_weather');
  });

  // Flue catches whatever the tool threw and feeds it back to the model as a tool result, so
  // nothing reaches the SDK's global handlers. Without an explicit capture there is an errored span
  // and no error event at all.
  it('captures an error event for a failed tool, rebuilt from `errorInfo`', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool_start', toolCallId: 'c1', toolName: 'boom', operationId: 'op_1' }, {});
      instrumentation.observe(
        {
          type: 'tool',
          toolCallId: 'c1',
          toolName: 'boom',
          operationId: 'op_1',
          isError: true,
          errorInfo: { type: 'Error', name: 'TypeError', message: 'kaboom', stack: 'TypeError: kaboom\n    at run' },
        },
        {},
      );
    });

    await client.flush();

    const exception = client.event?.exception?.values?.[0];
    expect(exception?.type).toBe('TypeError');
    expect(exception?.value).toBe('kaboom');
    expect(exception?.mechanism?.type).toBe('auto.ai.flue');
    // Handled: Flue caught the throw and returned it to the model, so no global hook sees it.
    expect(exception?.mechanism?.handled).toBe(true);
  });

  // Flue swallows the throw, so nothing else reports it. If a second capture path is ever added,
  // or the error starts propagating to the global handlers, this catches the duplicate.
  it('captures a failed tool exactly once', async () => {
    const events: Event[] = [];
    TestClient.sendEventCalled = event => events.push(event);

    try {
      await withAgent(() => {
        instrumentation.observe({ type: 'tool_start', toolCallId: 'c1', toolName: 'boom', operationId: 'op_1' }, {});
        instrumentation.observe(
          {
            type: 'tool',
            toolCallId: 'c1',
            toolName: 'boom',
            operationId: 'op_1',
            isError: true,
            errorInfo: { name: 'Error', message: 'kaboom' },
          },
          {},
        );
      });
      await client.flush();
    } finally {
      TestClient.sendEventCalled = undefined;
    }

    expect(events.filter(event => event.exception?.values?.length)).toHaveLength(1);
  });

  it('does not capture an error event for a tool that succeeded', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool_start', toolCallId: 'c1', toolName: 'ok', operationId: 'op_1' }, {});
      instrumentation.observe({ type: 'tool', toolCallId: 'c1', toolName: 'ok', operationId: 'op_1' }, {});
    });
    await client.flush();

    expect(client.event).toBeUndefined();
  });

  it('marks a failed tool call as errored', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool_start', toolCallId: 'call_1', toolName: 'boom', operationId: 'op_1' }, {});
      instrumentation.observe(
        { type: 'tool', toolCallId: 'call_1', toolName: 'boom', isError: true, operationId: 'op_1' },
        {},
      );
    });

    expect(findSpan('execute_tool boom')?.status).toBe('internal_error');
  });

  // Two agent runs overlap on a busy server. With shared closure state the second run is mistaken
  // for a re-entry of the first: it gets no span, and its conversation id lands on the first's span.
  it('keeps concurrent agent runs separate', async () => {
    const runA = instrumentation.interceptor({ type: 'agent', operationId: 'op_a' }, { agentName: 'A' }, async () => {
      instrumentation.observe({ type: 'agent_start', operationId: 'op_a', conversationId: 'conv_a' }, {});
      // B starts while A is still open.
      await instrumentation.interceptor({ type: 'agent', operationId: 'op_b' }, { agentName: 'B' }, async () => {
        instrumentation.observe({ type: 'agent_start', operationId: 'op_b', conversationId: 'conv_b' }, {});
      });
    });
    await runA;

    const agentA = findSpan('invoke_agent A');
    const agentB = findSpan('invoke_agent B');
    expect(agentA).toBeDefined();
    expect(agentB).toBeDefined();

    // Each run keeps its own conversation; neither is overwritten by the other.
    expect(agentA?.data['gen_ai.conversation.id']).toBe('conv_a');
    expect(agentB?.data['gen_ai.conversation.id']).toBe('conv_b');
  });

  it('ignores a settled tool it never opened a span for', async () => {
    await withAgent(() => {
      instrumentation.observe({ type: 'tool', toolCallId: 'never_started', toolName: 'x' }, {});
    });

    expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['invoke_agent Hello']);
  });

  it('ends spans still open at dispose', async () => {
    await withAgent(() => {
      instrumentation.observe(
        { type: 'tool_start', toolCallId: 'call_1', toolName: 'get_weather', operationId: 'op_1' },
        {},
      );
    });
    expect(findSpan('execute_tool get_weather')).toBeUndefined();

    instrumentation.dispose();

    expect(findSpan('execute_tool get_weather')).toBeDefined();
  });
});
