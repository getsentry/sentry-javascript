import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import {
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_TOOL_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL } from '@sentry/conventions/op';
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
