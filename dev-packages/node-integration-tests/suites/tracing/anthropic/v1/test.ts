import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

type SerializedSpan = SerializedStreamedSpanContainer['items'][number];

const CALLS = [
  { id: 'msg_v1_create', streaming: false },
  { id: 'msg_v1_beta_create', streaming: false },
  { id: 'msg_v1_stream', streaming: true },
  { id: 'msg_v1_stream_helper', streaming: true },
];

function spanForCall(spans: SerializedSpan[], id: string): SerializedSpan {
  const callSpans = spans.filter(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === id);
  expect(callSpans, id).toHaveLength(1);
  return callSpans[0]!;
}

function expectOneSentrySpanPerCall(container: SerializedStreamedSpanContainer): void {
  const spans = container.items;
  expect(spans.filter(span => span.name.startsWith('anthropic.'))).toEqual([]);

  for (const { id, streaming } of CALLS) {
    const chatSpan = spanForCall(spans, id);
    expect(chatSpan.attributes[SENTRY_ORIGIN]?.value, id).toBe('auto.ai.anthropic');
    expect(chatSpan.attributes[SENTRY_OP]?.value, id).toBe('gen_ai.chat');
    expect(chatSpan.attributes[GEN_AI_RESPONSE_STREAMING]?.value ?? false, id).toBe(streaming);
  }
}

describe('Anthropic integration (1.x)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('emits one span per call', async () => {
      await createRunner().unordered().expect({ span: expectOneSentrySpanPerCall }).start().completed();
    });

    test('emits one span per call when Sentry is the global tracer provider', async () => {
      await createRunner()
        .withEnv({ OTEL_SETUP: 'true' })
        .unordered()
        .expect({ span: expectOneSentrySpanPerCall })
        .start()
        .completed();
    });

    test("records Anthropic's own spans when the integration is removed", async () => {
      await createRunner()
        .withEnv({ OTEL_SETUP: 'true', WITHOUT_ANTHROPIC: 'true' })
        .unordered()
        .expect({
          span: container => {
            const spans = container.items;
            expect(spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.anthropic')).toEqual([]);

            for (const { id } of CALLS) {
              expect(spanForCall(spans, id).name, id).toBe('anthropic.messages.create');
            }
          },
        })
        .start()
        .completed();
    });
  });

  // 1.x makes its tool-runner and tool spans active around each tool run, even when they are no-ops.
  createEsmAndCjsTests(__dirname, 'scenario-tool-runner.mjs', 'instrument.mjs', (createRunner, test) => {
    for (const env of [{}, { OTEL_SETUP: 'true' }]) {
      test(`keeps tool spans under the caller's span with ${JSON.stringify(env)}`, async () => {
        await createRunner()
          .withEnv(env)
          .unordered()
          .expect({
            span: container => {
              const spans = container.items;
              expect(spans.filter(span => span.name.startsWith('anthropic.'))).toEqual([]);

              const main = spans.find(span => span.is_segment && span.name === 'main')!;
              const toolSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
              expect(toolSpans.map(span => span.attributes[GEN_AI_TOOL_NAME]?.value).sort()).toEqual([
                'explode',
                'weather',
              ]);
              for (const toolSpan of toolSpans) {
                expect(toolSpan.parent_span_id, toolSpan.name).toBe(main.span_id);
              }

              const weather = toolSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'weather')!;
              const lookups = spans.filter(span => span.name === 'weather lookup');
              expect(lookups).toHaveLength(1);
              expect(lookups[0]!.parent_span_id).toBe(weather.span_id);
            },
          })
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]?.value).toBe('Tool exploded');
            },
          })
          .start()
          .completed();
      });
    }
  });

  // Since 1.2, tool runners and `thread().stream()` send each turn through a thread, which parses the response itself.
  createEsmAndCjsTests(__dirname, 'scenario-threads.mjs', 'instrument.mjs', (createRunner, test) => {
    const MODES = [
      { mode: 'runner_stream_eager', streaming: true, turns: ['tools', 'final'] },
      { mode: 'runner_stream', streaming: true, turns: ['tools', 'final'] },
      { mode: 'runner_stream_unthreaded', streaming: true, turns: ['tools', 'final'] },
      { mode: 'runner', streaming: false, turns: ['tools', 'final'] },
      { mode: 'thread_send', streaming: false, turns: ['tools'] },
      { mode: 'thread_stream', streaming: true, turns: ['tools'] },
      { mode: 'thread_stream_signal_reuse', streaming: true, turns: ['tools', 'final'] },
    ];
    const FINAL_TURN_MODES = MODES.filter(({ turns }) => turns.includes('final'));
    // Only the span's status is known for these. The stream is aborted on its first event or before the response,
    // its body closes before `message_stop`, or the request fails.
    const STATUS_ONLY_MODES = [
      { mode: 'thread_stream_abort', status: 'ok' },
      { mode: 'thread_stream_abort_early', status: 'ok' },
      { mode: 'thread_stream_signal_abort', status: 'ok' },
      { mode: 'thread_stream_signal_timeout', status: 'error' },
      { mode: 'thread_stream_truncated', status: 'ok' },
      { mode: 'thread_stream_error', status: 'error' },
    ];

    describe.each([{}, { OTEL_SETUP: 'true' }])('with %j', env => {
      // Every scenario run is a Node process, so the cases below share one run.
      let run: Promise<SerializedSpan[]> | undefined;
      function getSpans(): Promise<SerializedSpan[]> {
        run ??= (async () => {
          const runner = createRunner().withEnv({ ...env, RECORD_OUTPUTS: 'true' });
          const spansPromise = runner.collectStreamedSpansUntilSegment('main');
          await runner.start().completed();
          return spansPromise;
        })();
        return run;
      }

      async function chatSpansUnder(mode: string): Promise<SerializedSpan[]> {
        const spans = await getSpans();
        const modeSpan = spans.find(span => span.name === mode)!;
        return spans.filter(
          span => span.parent_span_id === modeSpan.span_id && span.attributes[SENTRY_OP]?.value === GEN_AI_CHAT,
        );
      }

      test("emits one chat span per turn and none of the SDK's own spans", async () => {
        const spans = await getSpans();

        expect(spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_CHAT)).toHaveLength(
          // Plus the failed request and the follow-up of `thread_stream_failed_signal_reuse`, and the three requests
          // of `thread_stream_recovered`.
          MODES.flatMap(({ turns }) => turns).length + STATUS_ONLY_MODES.length + 2 + 3,
        );
        expect(spans.filter(span => span.name.startsWith('anthropic.'))).toEqual([]);
      });

      test.each(MODES)('nests one chat span per $mode turn under the caller', async ({ mode, turns }) => {
        const chatSpans = await chatSpansUnder(mode);

        expect(chatSpans.map(span => span.attributes[GEN_AI_RESPONSE_ID]?.value).sort()).toEqual(
          turns.map(turn => `msg_${mode}_${turn}`).sort(),
        );
      });

      test.each(MODES)('records the tool call of the first $mode turn', async ({ mode, streaming }) => {
        const chatSpan = spanForCall(await chatSpansUnder(mode), `msg_${mode}_tools`);

        expect(chatSpan.status).toBe('ok');
        expect(chatSpan.attributes[GEN_AI_RESPONSE_STREAMING]?.value ?? false).toBe(streaming);
        expect(chatSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
        expect(chatSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
        expect(JSON.parse(chatSpan.attributes[GEN_AI_RESPONSE_TOOL_CALLS]!.value as string)).toEqual([
          { type: 'tool_use', id: `toolu_${mode}`, name: 'weather', input: { city: 'Vienna' } },
        ]);
      });

      test.each(FINAL_TURN_MODES)('records the text of the final $mode turn', async ({ mode, streaming }) => {
        const chatSpan = spanForCall(await chatSpansUnder(mode), `msg_${mode}_final`);

        expect(chatSpan.status).toBe('ok');
        expect(chatSpan.attributes[GEN_AI_RESPONSE_STREAMING]?.value ?? false).toBe(streaming);
        expect(chatSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(30);
        expect(chatSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(5);
        expect(chatSpan.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('Sunny.');
        expect(chatSpan.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBeUndefined();
      });

      test.each(STATUS_ONLY_MODES)('ends the $mode chat span with status $status', async ({ mode, status }) => {
        const chatSpans = await chatSpansUnder(mode);

        expect(chatSpans).toHaveLength(1);
        expect(chatSpans[0]!.status).toBe(status);
      });

      // Deliberate. The rejected attempt was a real request that failed, like an http.client span that a retry
      // recovers from. Hiding it would mean copying the SDK's private recovery rules: they replay only some error codes,
      // only on a `continue`, and may change in any release, so a copy would silently hide real errors.
      test('keeps an error span for the attempt of a turn the thread recovered from', async () => {
        const chatSpans = await chatSpansUnder('thread_stream_recovered');

        expect(chatSpans.map(span => [span.attributes[GEN_AI_RESPONSE_ID]?.value, span.status])).toEqual([
          ['msg_thread_stream_recovered_1', 'ok'],
          [undefined, 'error'],
          ['msg_thread_stream_recovered_2', 'ok'],
        ]);
      });

      test("ends the span of a request sent with a failed stream's signal", async () => {
        const chatSpans = await chatSpansUnder('thread_stream_failed_signal_reuse');
        const followUp = spanForCall(chatSpans, 'msg_thread_stream_failed_signal_reuse_final');

        expect(chatSpans.map(span => span.status).sort()).toEqual(['error', 'ok']);
        expect(followUp.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(5);
        expect(followUp.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('Sunny.');
      });
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-session-tool-runner.mjs', 'instrument.mjs', (createRunner, test) => {
    for (const env of [{}, { OTEL_SETUP: 'true' }]) {
      test(`emits an execute_tool span for each tool a session runner runs with ${JSON.stringify(env)}`, async () => {
        let receivedEvent: Event | undefined;
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .withEnv(env)
          .unordered()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .expect({
            event: event => {
              receivedEvent = event;
            },
          })
          .start()
          .completed();

        const main = receivedSpans.find(span => span.is_segment && span.name === 'main')!;
        expect(receivedSpans.filter(span => span.name.startsWith('anthropic.'))).toEqual([]);
        const toolSpans = receivedSpans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
        expect(toolSpans.map(span => span.attributes[GEN_AI_TOOL_NAME]?.value).sort()).toEqual([
          'explode',
          'read',
          'weather',
        ]);
        const agentSpans = receivedSpans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_INVOKE_AGENT);
        expect(agentSpans).toHaveLength(2);
        for (const sessionId of ['sesn_weather', 'sesn_direct']) {
          const agent = agentSpans.find(span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === sessionId)!;
          expect(agent.parent_span_id, sessionId).toBe(main.span_id);
          const sessionTools = toolSpans.filter(span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === sessionId);
          expect(sessionTools.map(span => span.parent_span_id)).toEqual(sessionTools.map(() => agent.span_id));
        }
        expect(
          toolSpans
            .map(span => [span.attributes[GEN_AI_TOOL_NAME]?.value, span.attributes[GEN_AI_CONVERSATION_ID]?.value])
            .sort(),
        ).toEqual([
          ['explode', 'sesn_weather'],
          ['read', 'sesn_direct'],
          ['weather', 'sesn_weather'],
        ]);
        const weather = toolSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'weather')!;
        expect(weather.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toEqual({ type: 'string', value: 'sevt_weather' });
        expect(receivedEvent?.exception?.values?.[0]?.value).toBe('Tool exploded');
      });
    }
  });

  createEsmAndCjsTests(__dirname, 'scenario-platform-client.mjs', 'instrument.mjs', (createRunner, test) => {
    test('uses the provider name of a platform client such as AnthropicBedrock', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const chatSpan = spanForCall(container.items, 'msg_bedrock');
            expect(chatSpan.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('aws.bedrock');
          },
        })
        .start()
        .completed();
    });
  });
});
