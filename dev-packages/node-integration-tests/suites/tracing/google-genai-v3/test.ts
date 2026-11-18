import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_DECIDE, GEN_AI_EMBEDDINGS, GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

// `@google/genai` v3 needs Node 22. It calls the `v1` API instead of `v1beta`, which the shared
// `../google-genai` scenarios also serve.
describe.runIf(supports({ min: 22 }))('Google GenAI integration (v3)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    '../google-genai/scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('auto-instruments chat and generateContent on @google/genai v3', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(span => span.attributes[SENTRY_ORIGIN]?.value === EXPECTED_ORIGIN);
        expect(spans).toHaveLength(3);
        expect(spans.map(span => span.name).sort()).toEqual([
          'chat gemini-1.5-pro',
          'generate_content error-model',
          'generate_content gemini-1.5-flash',
        ]);

        const chatSpan = spans.find(span => span.name === 'chat gemini-1.5-pro');
        expect(chatSpan!.status).toBe('ok');
        expect(chatSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_CHAT);
        expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
        expect(chatSpan!.attributes[SENTRY_ORIGIN].value).toBe(EXPECTED_ORIGIN);
        expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
        expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-pro');
        expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
        expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
        expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

        const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
        expect(generateContentSpan!.status).toBe('ok');
        expect(generateContentSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_GENERATE_CONTENT);
        expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
        expect(generateContentSpan!.attributes[SENTRY_ORIGIN].value).toBe(EXPECTED_ORIGIN);
        expect(generateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
        expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-flash');
        expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
        expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
        expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
        expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
        expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
        expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

        const errorSpan = spans.find(span => span.name === 'generate_content error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_GENERATE_CONTENT);
        expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
        expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
      });
    },
    { additionalDependencies: { '@google/genai': '^3' } },
  );

  createEsmAndCjsTests(
    __dirname,
    '../google-genai/scenario-embeddings.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('auto-instruments embedContent on @google/genai v3', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const spans = (await spansPromise).filter(span => span.attributes[SENTRY_ORIGIN]?.value === EXPECTED_ORIGIN);
        expect(spans).toHaveLength(3);
        expect(spans.map(span => span.name).sort()).toEqual([
          'embeddings error-model',
          'embeddings text-embedding-004',
          'embeddings text-embedding-004',
        ]);

        const successfulSpans = spans.filter(
          span => span.name === 'embeddings text-embedding-004' && span.status === 'ok',
        );
        expect(successfulSpans).toHaveLength(2);
        for (const span of successfulSpans) {
          expect(span.attributes[SENTRY_OP].value).toBe(GEN_AI_EMBEDDINGS);
          expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
          expect(span.attributes[SENTRY_ORIGIN].value).toBe(EXPECTED_ORIGIN);
          expect(span.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
          expect(span.attributes[GEN_AI_REQUEST_MODEL].value).toBe('text-embedding-004');
        }

        const errorSpan = spans.find(span => span.name === 'embeddings error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_EMBEDDINGS);
        expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
      });
    },
    { additionalDependencies: { '@google/genai': '^3' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-decisions.mjs',
    'instrument-with-recording.mjs',
    (createRunner, test) => {
      test('instruments decisions.create as decide spans on @google/genai v3', async () => {
        const runner = createRunner().ignore('event');
        const spansPromise = runner.collectStreamedSpansUntilSegment('main');

        await runner.start().completed();

        const allSpans = await spansPromise;
        const mainSpan = allSpans.find(span => span.name === 'main');
        const spans = allSpans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_DECIDE);
        expect(spans).toHaveLength(3);
        for (const span of spans) {
          expect(span.parent_span_id).toBe(mainSpan!.span_id);
        }

        // Both successful spans share a name and may arrive in any order, so match on the input.
        const inputOf = (span: (typeof spans)[number]): string => String(span.attributes[GEN_AI_INPUT_MESSAGES]?.value);
        const textSpan = spans.find(span => inputOf(span).includes('charged twice'));
        const imageSpan = spans.find(span => inputOf(span).includes('package damaged'));

        expect(textSpan!.name).toBe('decide models/gemini-3-flash');
        expect(textSpan!.status).toBe('ok');
        expect(textSpan!.attributes).toMatchObject({
          [SENTRY_ORIGIN]: { value: EXPECTED_ORIGIN },
          [GEN_AI_OPERATION_NAME]: { value: 'decide' },
          [GEN_AI_PROVIDER_NAME]: { value: 'google_genai' },
          [GEN_AI_REQUEST_MODEL]: { value: 'models/gemini-3-flash' },
          [GEN_AI_USAGE_INPUT_TOKENS]: { value: 382 },
          [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: { value: 256 },
          [GEN_AI_USAGE_OUTPUT_TOKENS]: { value: 0 },
          [GEN_AI_USAGE_TOTAL_TOKENS]: { value: 382 },
        });
        expect(JSON.parse(textSpan!.attributes[GEN_AI_INPUT_MESSAGES]!.value as string)).toEqual([
          {
            type: 'evaluation',
            state: 'I was charged twice and want a refund.',
            questions: {
              wants_refund: {
                type: 'noul',
                instructions: 'Is a refund requested?',
                criteria: { true_description: 'Asks for money back' },
              },
              department: {
                type: 'choice',
                instructions: 'Which team should handle this?',
                criteria: { billing: 'Charges and refunds', other: 'Anything else' },
              },
              urgency: { type: 'score', instructions: 'How urgent is this ticket?', criteria: ['low', 'high'] },
            },
          },
        ]);
        expect(JSON.parse(textSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]!.value as string)).toEqual([
          {
            type: 'evaluation',
            answers: {
              wants_refund: { type: 'noul', noul: 0.97, confidence: 0.94 },
              department: {
                type: 'choice',
                choice: 'billing',
                probabilities: { billing: 0.82, other: 0.18 },
                confidence: 0.82,
              },
              urgency: {
                type: 'score',
                score: 1,
                probabilities: { 0: 0.05, 1: 0.95 },
                legend: { 0: 'low', 1: 'high' },
                confidence: 0.93,
              },
            },
          },
        ]);

        expect(JSON.parse(imageSpan!.attributes[GEN_AI_INPUT_MESSAGES]!.value as string)[0].state).toEqual([
          { type: 'text', text: 'Is the package damaged?' },
          { type: 'image', mime_type: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' },
        ]);

        const errorSpan = spans.find(span => span.name === 'decide models/error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('decide');
      });
    },
    { additionalDependencies: { '@google/genai': '^3' } },
  );
});
