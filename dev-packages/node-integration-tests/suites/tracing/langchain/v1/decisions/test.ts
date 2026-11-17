import { afterAll, expect, describe } from 'vitest';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../utils/runner';
import { join } from 'node:path';

describe('LangChain integration (v1)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-typesafe-classifier.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records a TypeSafeClassifier run as a gen_ai.decide span', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(
          span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain',
        );
        expect(spans.map(span => span.name)).toEqual(['decide jev-latest', 'decide jev-latest']);

        const [decideSpan, messageDecideSpan] = spans.sort((a, b) => a.start_timestamp - b.start_timestamp);
        expect(decideSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_DECIDE);
        expect(decideSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(decideSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('decide');
        expect(decideSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('typesafe');
        expect(decideSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe('jev-latest');
        expect(decideSpan.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('jev-1.13');
        expect(decideSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(30);
        expect(decideSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(2);
        expect(decideSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(32);
        expect(JSON.parse(decideSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            state: 'My payouts have been failing.',
            questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
          },
        ]);
        // A message is recorded as the transcript line the classifier sends, not as LangChain's serialized form.
        expect(JSON.parse(messageDecideSpan!.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            state: 'user: My card was charged twice.',
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
        '@langchain/typesafe': '^0.0.2',
      },
    },
  );

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-typesafe-classifier-inherited-callbacks.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('keeps the parent run callbacks for a TypeSafeClassifier called without config', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const segment = spans.find(span => span.is_segment && span.name === 'main');
        expect(segment!.attributes['test.recorded_runs'].value).toBe('RunnableLambda:root,TypeSafeClassifier:child');
        expect(spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_DECIDE)).toHaveLength(1);
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/typesafe': '^0.0.2',
        '@langchain/langgraph': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-typesafe-model-router.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records the Jev model router call inside a createAgent run', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = await spansPromise;
        const decideSpan = spans.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_DECIDE)!;
        const chatSpan = spans.find(span => span.name === 'chat claude-3-5-haiku-20241022')!;

        // The router classifies in `beforeAgent`, inside the agent run, where other chain steps are skipped.
        expect(decideSpan.name).toBe('decide jev-latest');
        expect(decideSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(decideSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('support_agent');
        expect(decideSpan.parent_span_id).toBe(chatSpan.parent_span_id);
        expect(JSON.parse(decideSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            // The router passes the latest human message, which the classifier sends as a transcript line.
            state: 'user: Where is my refund?',
            questions: {
              model_route: {
                type: 'choice',
                instructions: 'Pick the model for this request.',
                criteria: { fast: 'Simple requests', smart: 'Complex requests' },
              },
            },
          },
        ]);
        expect(JSON.parse(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value)).toEqual([
          {
            type: 'evaluation',
            answers: {
              model_route: {
                type: 'choice',
                choice: 'fast',
                probabilities: { fast: 0.9, smart: 0.1 },
                confidence: 0.8,
              },
            },
          },
        ]);
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
        '@langchain/typesafe': '^0.0.2',
      },
    },
  );
});
