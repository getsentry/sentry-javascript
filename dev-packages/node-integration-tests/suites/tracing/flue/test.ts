import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_OPERATION_NAME,
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
        await createRunner()
          .expect({ transaction: { transaction: 'flue-test' } })
          .expect({
            span: container => {
              const spans = container.items;
              const names = spans.map(span => span.name);

              expect(names).toContain('invoke_agent Hello');
              expect(names).toContain('execute_tool get_weather');
              expect(names.filter(name => name?.startsWith('chat'))).toHaveLength(2);

              const agent = spans.find(span => span.name === 'invoke_agent Hello')!;
              expect(agent.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(agent.attributes['sentry.origin'].value).toBe('auto.ai.flue');
              expect(agent.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
              expect(agent.attributes[GEN_AI_AGENT_NAME].value).toBe('Hello');
              expect(agent.attributes[GEN_AI_CONVERSATION_ID].value).toEqual(expect.any(String));

              const chat = spans.find(span => span.name?.startsWith('chat'))!;
              expect(chat.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(chat.attributes['sentry.origin'].value).toBe('auto.ai.flue');
              expect(chat.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toEqual(expect.any(Number));
              expect(chat.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toEqual(expect.any(Number));
              expect(chat.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toEqual(expect.any(Number));
              // Flue computes cost itself; no provider SDK reports it.
              expect(chat.attributes[GEN_AI_COST_TOTAL_TOKENS].value).toEqual(expect.any(Number));

              const tool = spans.find(span => span.name === 'execute_tool get_weather')!;
              expect(tool.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(tool.attributes['sentry.origin'].value).toBe('auto.ai.flue');
              expect(tool.attributes[GEN_AI_TOOL_NAME].value).toBe('get_weather');

              // Tool spans are siblings of `chat` under the agent invocation, matching how Flue's
              // own OpenTelemetry adapter projects them.
              expect(tool.parent_span_id).toBe(agent.span_id);
              expect(chat.parent_span_id).toBe(agent.span_id);
            },
          })
          .start()
          .completed();
      });
    },
    FLUE_DEPENDENCIES,
  );
});
