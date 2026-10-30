import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import {
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
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL } from '@sentry/conventions/op';
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
      // Only the span's status is known for these. The stream is aborted on its first event or before the response,
      // its body closes before `message_stop`, or the request fails.
      { mode: 'thread_stream_abort', streaming: true, turns: ['abort'], status: 'ok' },
      { mode: 'thread_stream_abort_early', streaming: true, turns: ['abort'], status: 'ok' },
      { mode: 'thread_stream_truncated', streaming: true, turns: ['truncated'], status: 'ok' },
      { mode: 'thread_stream_error', streaming: true, turns: ['error'], status: 'error' },
    ];
    const TURNS: Record<string, { input?: number; output?: number; text?: string; toolCall?: boolean }> = {
      tools: { input: 10, output: 20, toolCall: true },
      final: { input: 30, output: 5, text: 'Sunny.' },
    };

    for (const env of [{}, { OTEL_SETUP: 'true' }]) {
      test(`emits one chat span per thread turn with ${JSON.stringify(env)}`, async () => {
        const runner = createRunner().withEnv({ ...env, RECORD_OUTPUTS: 'true' });
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const chatSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_CHAT);
        expect(chatSpans).toHaveLength(MODES.flatMap(({ turns }) => turns).length);
        expect(spans.filter(span => span.name.startsWith('anthropic.'))).toEqual([]);

        for (const { mode, streaming, turns, status } of MODES) {
          const modeSpan = spans.find(span => span.name === mode)!;
          const modeChatSpans = chatSpans.filter(span => span.parent_span_id === modeSpan.span_id);
          expect(modeChatSpans, mode).toHaveLength(turns.length);

          if (status) {
            expect(modeChatSpans[0]!.status, mode).toBe(status);
            continue;
          }

          for (const turn of turns) {
            const id = `msg_${mode}_${turn}`;
            const chatSpan = spanForCall(modeChatSpans, id);
            const { input, output, text, toolCall } = TURNS[turn]!;
            expect(chatSpan.status, id).toBe('ok');
            expect(chatSpan.attributes[GEN_AI_RESPONSE_STREAMING]?.value ?? false, id).toBe(streaming);
            expect(chatSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value, id).toBe(input);
            expect(chatSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value, id).toBe(output);
            if (text) {
              expect(chatSpan.attributes[GEN_AI_RESPONSE_TEXT]?.value, id).toBe(text);
            }
            const toolCalls = chatSpan.attributes[GEN_AI_RESPONSE_TOOL_CALLS]?.value as string | undefined;
            expect(toolCalls && JSON.parse(toolCalls), id).toEqual(
              toolCall
                ? [{ type: 'tool_use', id: `toolu_${mode}`, name: 'weather', input: { city: 'Vienna' } }]
                : undefined,
            );
          }
        }
      });
    }
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
        for (const toolSpan of toolSpans) {
          expect(toolSpan.parent_span_id, toolSpan.name).toBe(main.span_id);
        }
        const weather = toolSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'weather')!;
        expect(weather.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toEqual({ type: 'string', value: 'sevt_weather' });
        expect(receivedEvent?.exception?.values?.[0]?.value).toBe('Tool exploded');
      });
    }
  });
});
