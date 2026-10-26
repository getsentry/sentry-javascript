import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
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
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const rootSpan = spans.find(span => span.is_segment && span.name === 'main')!;
        const agentSpan = spans.find(span => span.name === 'invoke_agent triage_graph')!;
        const decideSpan = spans.find(span => span.name === 'decide jev-latest')!;

        expect(agentSpan.parent_span_id).toBe(rootSpan.span_id);
        expect(decideSpan.parent_span_id).toBe(agentSpan.span_id);
        expect(decideSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_DECIDE);
        expect(decideSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(decideSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('triage_graph');
        expect(JSON.parse(decideSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            state: 'My payouts have been failing.',
            questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
          },
        ]);
        expect(JSON.parse(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value)).toEqual([
          { type: 'evaluation', answers: { urgent: { type: 'noul', noul: 0.9 } } },
        ]);
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/langgraph': '^1.0.0',
        '@langchain/typesafe': '^0.0.2',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-typesafe-classifier-node.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('omits the classifier input and output when genAI recording is off', async () => {
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const decideSpan = spans.find(span => span.name === 'decide jev-latest')!;

        expect(decideSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_DECIDE);
        expect(decideSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
        expect(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/langgraph': '^1.0.0',
        '@langchain/typesafe': '^0.0.2',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-stream.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates one agent span per stream() run, ended by the graph run', async () => {
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const agentSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent');
        const agentSpanFor = (prompt: string) =>
          agentSpans.find(span => String(span.attributes[GEN_AI_INPUT_MESSAGES]?.value).includes(prompt));
        const byName = (name: string) => agentSpans.filter(span => span.name === `invoke_agent ${name}`);

        expect(agentSpans).toHaveLength(13);

        for (const prompt of ['Read the whole stream', 'Never read the stream', 'Stream inside a runnable']) {
          const span = agentSpanFor(prompt)!;
          expect(span.status).toBe('ok');
          expect(span.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
          expect(span.attributes[GEN_AI_RESPONSE_TEXT]?.value).toBe('[{"role":"assistant","content":"Sunny"}]');
          expect(
            spans.filter(
              child => child.attributes[SENTRY_OP]?.value === 'gen_ai.chat' && child.parent_span_id === span.span_id,
            ),
          ).toHaveLength(1);
        }

        expect(agentSpanFor('Break out of the stream')?.status).toBe('ok');
        expect(agentSpanFor('Cancel the stream')?.status).toBe('ok');
        expect(byName('slow_graph')[0]?.status).toBe('ok');
        expect(byName('failing_graph')[0]?.status).toBe('error');

        const approvals = byName('approval_graph');
        expect(approvals).toHaveLength(2);
        expect(approvals.map(span => span.status)).toEqual(['ok', 'ok']);

        expect(agentSpanFor('Stream events v3')?.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);

        const invoked = agentSpanFor('Invoke with a nested stream')!;
        const nested = agentSpanFor('Nested stream of the same graph')!;
        expect(invoked.attributes[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
        expect(nested.parent_span_id).toBe(invoked.span_id);
        expect(byName('recursive_graph')).toHaveLength(2);

        const manual = byName('manual_graph');
        expect(manual).toHaveLength(1);
        expect(manual[0]!.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
      });
    },
    {
      additionalDependencies: {
        '@langchain/core': '^1.0.0',
        '@langchain/langgraph': '^1.0.0',
      },
    },
  );
});
