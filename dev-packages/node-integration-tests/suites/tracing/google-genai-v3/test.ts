import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

// `@google/genai` v3 needs Node 22 and calls the `v1` API instead of `v1beta`, so the scenarios here
// differ from `../google-genai-v2` only in the mock server routes.
describe.runIf(supports({ min: 22 }))('Google GenAI integration (v3)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
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
        expect(chatSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
        expect(chatSpan!.attributes[SENTRY_ORIGIN].value).toBe(EXPECTED_ORIGIN);
        expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
        expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-pro');
        expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
        expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
        expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

        const generateContentSpan = spans.find(span => span.name === 'generate_content gemini-1.5-flash');
        expect(generateContentSpan!.status).toBe('ok');
        expect(generateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
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
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
        expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
        expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
      });
    },
    { additionalDependencies: { '@google/genai': '^3' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-embeddings.mjs',
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
          expect(span.attributes[SENTRY_OP].value).toBe('gen_ai.embeddings');
          expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
          expect(span.attributes[SENTRY_ORIGIN].value).toBe(EXPECTED_ORIGIN);
          expect(span.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
          expect(span.attributes[GEN_AI_REQUEST_MODEL].value).toBe('text-embedding-004');
        }

        const errorSpan = spans.find(span => span.name === 'embeddings error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.embeddings');
        expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
      });
    },
    { additionalDependencies: { '@google/genai': '^3' } },
  );
});
