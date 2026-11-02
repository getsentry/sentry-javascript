import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_TOOL_NAME,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// The attribute extraction is version-independent and covered by the suite pinned to 0.63. What a
// newer SDK puts at risk is how its internals are recognised: since 0.106 the `messages.stream()`
// helper tags its internal `create` call with a lowercase `x-stainless-helper-method` header (it
// was `X-Stainless-Helper-Method` up to 0.105), and the dedup of that call keyed on the exact casing.
describe('Anthropic integration (0.129)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-stream-helper.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('emits one span for messages.stream(), not a second one for its internal create', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              const streamingSpans = container.items.filter(
                span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream_1',
              );
              expect(streamingSpans).toHaveLength(1);
              expect(streamingSpans[0]!.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'gen_ai.chat' });
              expect(streamingSpans[0]!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
                type: 'boolean',
                value: true,
              });
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );

  // These helpers send the same header, but no `messages-stream` span covers them. So their
  // internal `create` must still get a span.
  createEsmAndCjsTests(
    __dirname,
    'scenario-beta-stream-helpers.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('emits one span each for beta.messages.stream() and the eager streaming tool runner', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              for (const id of ['msg_beta_stream', 'msg_tool_runner_eager']) {
                const spans = container.items.filter(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === id);
                expect(spans, id).toHaveLength(1);
                expect(spans[0]!.attributes[SENTRY_OP]).toEqual({ type: 'string', value: 'gen_ai.chat' });
              }
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tool-runner.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('emits an execute_tool span for each tool the eager runner starts', async () => {
        let receivedEvent: Event | undefined;
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
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
        const chat = receivedSpans.find(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_tools')!;
        const weather = receivedSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'weather')!;
        const explode = receivedSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'explode')!;

        expect(weather).toMatchObject({
          name: 'execute_tool weather',
          parent_span_id: main.span_id,
          status: 'ok',
          attributes: expect.objectContaining({
            [SENTRY_OP]: { type: 'string', value: GEN_AI_EXECUTE_TOOL },
            [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: { type: 'string', value: 'toolu_weather' },
          }),
        });
        // The eager runner starts the first tool while the reply that called it is still streaming.
        expect(weather.start_timestamp).toBeLessThan(chat.end_timestamp);

        expect(explode).toMatchObject({ name: 'execute_tool explode', parent_span_id: main.span_id, status: 'error' });
        expect(receivedEvent).toMatchObject({
          exception: {
            values: [{ value: 'Tool exploded', mechanism: { type: 'auto.ai.anthropic', handled: true } }],
          },
        });
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-environment-worker.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('gives each session an EnvironmentWorker runs a trace of its own, apart from the request that started it', async () => {
        const receivedSpans: SerializedStreamedSpanContainer['items'] = [];
        const sessionSegment = {
          span: (container: SerializedStreamedSpanContainer) => {
            expect(container.items.find(span => span.is_segment && span.name === 'invoke_agent')).toBeDefined();
            receivedSpans.push(...container.items);
          },
        };

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(
                container.items.find(span => span.is_segment && span.name === 'POST /workers/start'),
              ).toBeDefined();
              receivedSpans.push(...container.items);
            },
          })
          .expect(sessionSegment)
          .expect(sessionSegment)
          .start()
          .completed();

        const request = receivedSpans.find(span => span.name === 'POST /workers/start')!;
        const agentSpans = receivedSpans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_INVOKE_AGENT);
        expect(agentSpans).toHaveLength(2);
        expect(new Set([request.trace_id, ...agentSpans.map(span => span.trace_id)]).size).toBe(3);

        for (const sessionId of ['sesn_vienna', 'sesn_graz']) {
          const agent = agentSpans.find(span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === sessionId)!;
          expect(agent).toMatchObject({ name: 'invoke_agent', is_segment: true, status: 'ok' });
          expect(agent.parent_span_id).toBeUndefined();

          const toolSpans = receivedSpans.filter(
            span =>
              span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL &&
              span.attributes[GEN_AI_CONVERSATION_ID]?.value === sessionId,
          );
          expect(toolSpans).toHaveLength(1);
          expect(toolSpans[0]).toMatchObject({ name: 'execute_tool weather', parent_span_id: agent.span_id });
        }
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-session-tool-runner.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('parents the execute_tool spans of each session runner to one invoke_agent span', async () => {
        let receivedEvent: Event | undefined;
        const receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans.push(...container.items);
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
        const agentSpans = receivedSpans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_INVOKE_AGENT);
        expect(agentSpans).toHaveLength(2);
        const weatherSession = agentSpans.find(
          span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'sesn_weather',
        )!;
        const directSession = agentSpans.find(
          span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'sesn_direct',
        )!;
        expect(weatherSession).toMatchObject({ name: 'invoke_agent', parent_span_id: main.span_id, status: 'ok' });
        expect(directSession).toMatchObject({ name: 'invoke_agent', parent_span_id: main.span_id, status: 'ok' });

        const toolSpans = receivedSpans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
        expect(toolSpans).toHaveLength(3);
        const weather = toolSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'weather')!;
        const explode = toolSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'explode')!;
        const read = toolSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'read')!;

        expect(weather).toMatchObject({
          name: 'execute_tool weather',
          parent_span_id: weatherSession.span_id,
          status: 'ok',
          attributes: expect.objectContaining({
            [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: { type: 'string', value: 'sevt_weather' },
            [GEN_AI_CONVERSATION_ID]: { type: 'string', value: 'sesn_weather' },
          }),
        });
        expect(explode).toMatchObject({
          name: 'execute_tool explode',
          parent_span_id: weatherSession.span_id,
          status: 'error',
        });
        expect(read).toMatchObject({
          name: 'execute_tool read',
          parent_span_id: directSession.span_id,
          status: 'ok',
          attributes: expect.objectContaining({
            [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: { type: 'string', value: 'sevt_read' },
            [GEN_AI_CONVERSATION_ID]: { type: 'string', value: 'sesn_direct' },
          }),
        });
        expect(receivedEvent).toMatchObject({
          exception: {
            values: [{ value: 'Tool exploded', mechanism: { type: 'auto.ai.anthropic', handled: true } }],
          },
        });
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );
});
