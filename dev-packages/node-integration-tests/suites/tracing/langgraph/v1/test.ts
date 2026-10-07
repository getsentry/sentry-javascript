import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EVALUATE } from '@sentry/conventions/op';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('LangGraph integration (v1)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-typesafe-classifier-node.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records a TypeSafeClassifier call made inside a StateGraph node', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const agentSpan = container.items.find(span => span.name === 'invoke_agent triage_graph')!;
              const evaluateSpan = container.items.find(span => span.name === 'evaluate jev-latest')!;

              expect(evaluateSpan.parent_span_id).toBe(agentSpan.span_id);
              expect(evaluateSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_EVALUATE);
              expect(evaluateSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
              expect(evaluateSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('triage_graph');
              expect(JSON.parse(evaluateSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
                {
                  type: 'evaluation',
                  state: 'My payouts have been failing.',
                  questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
                },
              ]);
              expect(JSON.parse(evaluateSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value)).toEqual([
                { type: 'evaluation', answers: { urgent: { type: 'noul', noul: 0.9 } } },
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/langgraph': '^1.0.0',
        '@langchain/typesafe': '0.0.2',
      },
    },
  );
});
