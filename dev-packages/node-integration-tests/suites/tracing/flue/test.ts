import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_OPERATION_NAME,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// `@flue/runtime` declares `engines.node >= 22.19`, so it can't live in the package's root
// `devDependencies` (that would break `yarn install` on the 20.19 CI matrix). Install it per-suite
// instead, guarded by the `min: 22` skip below.
const FLUE_DEPENDENCIES = {
  additionalDependencies: {
    '@flue/runtime': '2.0.3',
    '@earendil-works/pi-ai': '0.85.1',
  },
};

conditionalTest({ min: 22 })('Flue integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test, mode) => {
      // `@flue/runtime` is ESM-only — its `exports` map has no `require` condition, so there is no
      // CJS variant of this scenario to run.
      if (mode === 'cjs') {
        return;
      }

      test('creates the invoke_agent / chat / execute_tool hierarchy', async () => {
        let rootSpanId: string | undefined;

        await createRunner()
          .expect({
            transaction: event => {
              expect(event.transaction).toBe('flue-test');
              rootSpanId = event.contexts?.trace?.span_id;
            },
          })
          .expect({
            span: container => {
              const spans = container.items;

              // Counted rather than looked up: the interceptor skips the submission wrapper
              // operation, so one dispatch opens exactly one agent span, and each turn and tool call
              // is spanned once. `find` passes just as happily on a duplicate.
              expect(spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.ai.flue')).toHaveLength(4);

              const agents = spans.filter(span => span.name === 'invoke_agent Hello');
              const chats = spans.filter(span => span.name === 'chat faux-model');
              const tools = spans.filter(span => span.name === 'execute_tool get_weather');
              expect(agents).toHaveLength(1);
              expect(tools).toHaveLength(1);
              // One turn asks for the tool, the second answers with its result.
              expect(chats).toHaveLength(2);

              const agent = agents[0]!;
              expect(agent.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(agent.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('invoke_agent');
              expect(agent.attributes[GEN_AI_AGENT_NAME]?.value).toBe('Hello');
              expect(agent.parent_span_id).toBe(rootSpanId);

              const conversationId = agent.attributes[GEN_AI_CONVERSATION_ID]?.value;
              expect(conversationId).toEqual(expect.any(String));

              // Both turns, not just the first: they leave the provider by different paths (a tool
              // call, then a final answer) and resolve their parent through separate tracker lookups.
              for (const chat of chats) {
                expect(chat.attributes['sentry.op']?.value).toBe('gen_ai.chat');
                expect(chat.attributes['sentry.origin']?.value).toBe('auto.ai.flue');
                expect(chat.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
                expect(chat.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe(conversationId);
                expect(chat.parent_span_id).toBe(agent.span_id);
                expect(chat.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBeGreaterThan(0);
                expect(chat.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBeGreaterThan(0);
                expect(chat.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBeGreaterThan(0);
                // Flue computes cost itself; no provider SDK reports it. The faux provider prices
                // every model at zero, so this only proves the attribute is mapped.
                expect(chat.attributes[GEN_AI_COST_TOTAL_TOKENS]?.value).toEqual(expect.any(Number));
              }

              expect(chats.map(chat => chat.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).sort()).toEqual([
                '["stop"]',
                '["toolUse"]',
              ]);

              const tool = tools[0]!;
              expect(tool.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(tool.attributes['sentry.origin']?.value).toBe('auto.ai.flue');
              expect(tool.attributes[GEN_AI_TOOL_NAME]?.value).toBe('get_weather');

              // Tool spans are siblings of `chat` under the agent invocation, matching how Flue's
              // own OpenTelemetry adapter projects them.
              expect(tool.parent_span_id).toBe(agent.span_id);
            },
          })
          .start()
          .completed();
      });
    },
    FLUE_DEPENDENCIES,
  );
});
