import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  SENTRY_STATUS_MESSAGE,
} from '@sentry/conventions/attributes';

import { afterAll, describe, expect } from 'vitest';

import { supports } from '../../../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../../../utils/runner';
import { dirname } from 'node:path';

const scenarioDirectory = dirname(__dirname);

// The provider session id that pi-durable stores with each conversation, a UUIDv7.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The pi packages declare `engines.node >= 22.19`.
describe.runIf(supports({ min: 22 }))('pi-durable integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(scenarioDirectory, 'scenario-retention.mjs', 'instrument.mjs', (createRunner, test) => {
    // Bun does not implement `v8.setFlagsFromString`, which the scenario needs to force GC.
    test.runIf(supports({ runtimes: ['node', 'deno'] }))(
      'does not keep the traces of tool calls alive for subagent conversations that never run',
      async () => {
        await createRunner()
          .ignore('span')
          .expect({ event: { message: 'pi-durable retention', extra: { toolCalls: 3, alive: 0 } } })
          .start()
          .completed();
      },
    );
  });

  createEsmTests(scenarioDirectory, 'scenario-restart-abort.mjs', 'instrument.mjs', (createRunner, test) => {
    test('starts no run for an abort handler in a Harness that never saw the run', async () => {
      await createRunner()
        .ignore('span')
        .expect({
          event: {
            message: 'pi-durable restart abort',
            extra: { status: 'unanswered', reason: 'aborted', runsStarted: 0 },
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(scenarioDirectory, 'scenario-interrupted.mjs', 'instrument.mjs', (createRunner, test) => {
    test('reports a provider that throws as a fault, and nothing for failed, aborted or closed runs', async () => {
      await createRunner()
        .ignore('span')
        .expect({
          event: event => {
            const exception = event.exception?.values?.[0];
            expect(exception?.value).toBe('provider broke');
            expect(exception?.mechanism).toEqual({ type: 'auto.ai.pi_durable', handled: false });
          },
        })
        .expect({
          event: event => {
            expect(event.message).toBe('pi-durable interrupted done');
          },
        })
        .start()
        .completed();
    });

    test('ends every run that does not end with an answer', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            // 1. The model request failed: the run and the request are errors.
            const chat = container.items.find(span => span.name === 'chat faux-model')!;
            expect(chat.attributes[GEN_AI_INPUT_MESSAGES]?.value).toContain('Fail please.');
            expect(chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["error"]');
            expect(chat.status).toBe('error');
            expect(chat.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('internal_error');
            const agent = container.items.find(span => span.is_segment)!;
            expect(agent.name).toBe('invoke_agent');
            expect(agent.status).toBe('error');
            expect(agent.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('model_error');
          },
        })
        .expect({
          span: container => {
            // 2. The provider threw in front of pi-ai, so there is no request to report.
            expect(container.items.find(span => span.name === 'chat faux-model')).toBeUndefined();
            const agent = container.items.find(span => span.is_segment)!;
            expect(agent.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('internal_error');
          },
        })
        .expect({
          span: container => {
            // 3. Aborted while the tool ran: cancelled, which streamed spans report as ok.
            const slow = container.items.find(span => span.name === 'execute_tool slow')!;
            expect(slow.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value).toBe('{"job":"abort"}');
            expect(slow.status).toBe('ok');
            expect(container.items.find(span => span.is_segment)!.status).toBe('ok');
          },
        })
        .expect({
          span: container => {
            // 4. Aborted while the model request ran.
            const chat = container.items.find(span => span.name === 'chat faux-model')!;
            expect(chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["aborted"]');
            expect(container.items).toHaveLength(2);
          },
        })
        .expect({
          span: container => {
            // 5. The Harness closed while the tool ran: the run still ends, so the trace has a segment.
            const slow = container.items.find(span => span.name === 'execute_tool slow')!;
            expect(slow.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value).toBe('{"job":"close"}');
            const agent = container.items.find(span => span.is_segment)!;
            expect(agent.name).toBe('invoke_agent');
            expect(slow.parent_span_id).toBe(agent.span_id);
          },
        })
        .expect({
          span: container => {
            // 6. The run failed, and the Harness closed right after `wait()`, before the commit that
            // ended the run resolved: the run keeps its own status.
            const chat = container.items.find(span => span.name === 'chat faux-model')!;
            expect(chat.attributes[GEN_AI_INPUT_MESSAGES]?.value).toContain('Fail, then close.');
            const agent = container.items.find(span => span.is_segment)!;
            expect(agent.status).toBe('error');
            expect(agent.attributes[SENTRY_STATUS_MESSAGE]?.value).toBe('model_error');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(scenarioDirectory, 'scenario-concurrent.mjs', 'instrument.mjs', (createRunner, test) => {
    test('keeps concurrent runs apart and out of the scopes of the requests that submitted them', async () => {
      const runTraceIds = new Set<string>();
      const errorTraceIds = new Set<string>();

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const spans = container.items;
            const agent = spans.find(span => span.is_segment)!;
            expect(agent.name).toBe('invoke_agent');
            const chats = spans.filter(span => span.name === 'chat faux-model');
            expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_INPUT_MESSAGES]?.value))[0].parts[0].content).toBe(
              'request A',
            );
            // The run's own conversation id, not the one the request set on its scope.
            const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
            expect(conversationId).toMatch(UUID);
            for (const span of spans) {
              expect(span.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
              expect(span.attributes['request']).toBeUndefined();
            }
            expect(
              spans.find(span => span.name === 'execute_tool work')!.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value,
            ).toBe('{"tag":"request A"}');
            runTraceIds.add(agent.trace_id);
          },
        })
        .expect({
          span: container => {
            const spans = container.items;
            const agent = spans.find(span => span.is_segment)!;
            expect(agent.name).toBe('invoke_agent');
            const chats = spans.filter(span => span.name === 'chat faux-model');
            expect(JSON.parse(String(chats[0]!.attributes[GEN_AI_INPUT_MESSAGES]?.value))[0].parts[0].content).toBe(
              'request B',
            );
            const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
            expect(conversationId).toMatch(UUID);
            for (const span of spans) {
              expect(span.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
              expect(span.attributes['request']).toBeUndefined();
            }
            expect(
              spans.find(span => span.name === 'execute_tool work')!.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]?.value,
            ).toBe('{"tag":"request B"}');
            runTraceIds.add(agent.trace_id);
          },
        })
        .expect({
          event: event => {
            expect(event.exception?.values?.[0]?.value).toBe('work failed for request A');
            expect(event.tags?.request).toBeUndefined();
            errorTraceIds.add(String(event.contexts?.trace?.trace_id));
          },
        })
        .expect({
          event: event => {
            expect(event.exception?.values?.[0]?.value).toBe('work failed for request B');
            expect(event.tags?.request).toBeUndefined();
            errorTraceIds.add(String(event.contexts?.trace?.trace_id));
          },
        })
        .start()
        .completed();

      // Each tool error belongs to its run's trace.
      expect(errorTraceIds).toEqual(runTraceIds);
    });
  });

  createEsmTests(scenarioDirectory, 'scenario-compaction.mjs', 'instrument.mjs', (createRunner, test) => {
    test('keeps a compaction that pi-durable starts for a run inside that run', async () => {
      await createRunner()
        .unordered()
        .expect({
          span: container => {
            const spans = container.items;
            const summary = spans.find(span =>
              String(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).includes('Summary'),
            )!;
            const agent = spans.find(span => span.is_segment)!;
            expect(agent.name).toBe('invoke_agent');
            expect(summary.parent_span_id).toBe(agent.span_id);
            // pi-durable completes the summary without streaming; the run's own request streams.
            expect(summary.attributes[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
            const answer = spans.find(span =>
              String(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).includes('Third answer'),
            )!;
            expect(answer.parent_span_id).toBe(agent.span_id);
            expect(answer.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
          },
        })
        .expect({
          span: container => expect(container.items.find(span => span.is_segment)!.name).toBe('invoke_agent'),
        })
        .expect({
          span: container => expect(container.items.find(span => span.is_segment)!.name).toBe('invoke_agent'),
        })
        .start()
        .completed();
    });
  });
});
