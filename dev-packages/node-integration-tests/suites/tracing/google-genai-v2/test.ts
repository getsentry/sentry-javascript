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
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

// `@google/genai` v2 restructured the `Models` class so `embedContent` is a constructor-assigned arrow
// property rather than a class method (v1 shape). The orchestrion config caps at `<3`, so the code
// transformer only injects the diagnostics channels for v2 when the range includes it — this suite pins
// `^2` and re-runs the core auto-instrumentation assertions to guard that path. The v1 suite lives in
// `../google-genai`; the scenario files are byte-identical because v2 kept the public API surface.
describe('Google GenAI integration (v2)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('auto-instruments chat and generateContent on @google/genai v2', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(3);
              expect(container.items.map(span => span.name).sort()).toEqual([
                'chat gemini-1.5-pro',
                'generate_content error-model',
                'generate_content gemini-1.5-flash',
              ]);

              const chatSpan = container.items.find(span => span.name === 'chat gemini-1.5-pro');
              expect(chatSpan!.status).toBe('ok');
              expect(chatSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
              expect(chatSpan!.attributes['sentry.origin'].value).toBe(EXPECTED_ORIGIN);
              expect(chatSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
              expect(chatSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-pro');
              expect(chatSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
              expect(chatSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
              expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

              const generateContentSpan = container.items.find(
                span => span.name === 'generate_content gemini-1.5-flash',
              );
              expect(generateContentSpan!.status).toBe('ok');
              expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
              expect(generateContentSpan!.attributes['sentry.origin'].value).toBe(EXPECTED_ORIGIN);
              expect(generateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
              expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gemini-1.5-flash');
              expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
              expect(generateContentSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.9);
              expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
              expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
              expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
              expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);

              const errorSpan = container.items.find(span => span.name === 'generate_content error-model');
              expect(errorSpan!.status).toBe('error');
              expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('generate_content');
              expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { '@google/genai': '^2' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-embeddings.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      // `embedContent` is the member that changed shape in v2; asserting its span proves the
      // `className`/`methodName` selector still matches the constructor-assigned arrow.
      test('auto-instruments embedContent on @google/genai v2', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(3);
              expect(container.items.map(span => span.name).sort()).toEqual([
                'embeddings error-model',
                'embeddings text-embedding-004',
                'embeddings text-embedding-004',
              ]);

              const successfulSpans = container.items.filter(
                span => span.name === 'embeddings text-embedding-004' && span.status === 'ok',
              );
              expect(successfulSpans).toHaveLength(2);
              for (const span of successfulSpans) {
                expect(span.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
                expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
                expect(span.attributes['sentry.origin'].value).toBe(EXPECTED_ORIGIN);
                expect(span.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');
                expect(span.attributes[GEN_AI_REQUEST_MODEL].value).toBe('text-embedding-004');
              }

              const errorSpan = container.items.find(span => span.name === 'embeddings error-model');
              expect(errorSpan!.status).toBe('error');
              expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
              expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { '@google/genai': '^2' } },
  );
});
