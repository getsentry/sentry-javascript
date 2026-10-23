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
      test('creates one agent span per invoke() and stream() run, with chat spans under it', async () => {
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const rootSpan = spans.find(span => span.is_segment && span.name === 'main')!;
        const agentSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent');
        const chatSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.chat');
        expect(agentSpans).toHaveLength(3);
        expect(chatSpans).toHaveLength(3);

        const agentSpanFor = (prompt: string) =>
          agentSpans.find(span => String(span.attributes[GEN_AI_INPUT_MESSAGES]?.value).includes(prompt))!;
        const invokeSpan = agentSpanFor('Invoke the forecast');
        const streamSpan = agentSpanFor('Stream the forecast');
        const abandonedSpan = agentSpanFor('Abandon the forecast');

        expect(invokeSpan.attributes[GEN_AI_RESPONSE_STREAMING]).toBeUndefined();
        expect(invokeSpan.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('[{"role":"assistant","content":"Sunny"}]');
        expect(streamSpan.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);
        expect(streamSpan.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('[{"role":"assistant","content":"Cloudy"}]');
        expect(abandonedSpan.attributes[GEN_AI_RESPONSE_STREAMING].value).toBe(true);

        for (const agentSpan of agentSpans) {
          expect(agentSpan.name).toBe('invoke_agent weather_graph');
          expect(agentSpan.status).toBe('ok');
          expect(agentSpan.parent_span_id).toBe(rootSpan.span_id);
          expect(chatSpans.filter(span => span.parent_span_id === agentSpan.span_id)).toHaveLength(1);
        }
      });
    },
    {
      additionalDependencies: {
        '@langchain/core': '^1.0.0',
        '@langchain/langgraph': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-stream-edge.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('handles cancel, subgraphs, tee() and manual options on streamed runs', async () => {
        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const agentSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent');
        expect(agentSpans).toHaveLength(4);
        const agentSpanFor = (prompt: string) =>
          agentSpans.find(span => String(span.attributes[GEN_AI_INPUT_MESSAGES]?.value).includes(prompt))!;

        expect(agentSpanFor('Cancel while iterating').status).toBe('ok');
        expect(agentSpanFor('Stream with subgraphs').attributes[GEN_AI_RESPONSE_TEXT].value).toBe(
          '[{"role":"assistant","content":"Cloudy"}]',
        );
        expect(agentSpanFor('Tee the forecast').attributes[GEN_AI_RESPONSE_TEXT].value).toBe(
          '[{"role":"assistant","content":"Rainy"}]',
        );

        const manualSpan = agentSpans.find(span => span.name === 'invoke_agent manual_graph')!;
        expect(manualSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
        expect(manualSpan.attributes[GEN_AI_RESPONSE_TEXT].value).toBe('[{"role":"assistant","content":"Windy"}]');
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
