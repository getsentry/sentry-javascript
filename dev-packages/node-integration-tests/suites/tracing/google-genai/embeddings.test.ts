import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const EXPECTED_ORIGIN = 'auto.ai.google_genai';

describe('Google GenAI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates google genai embeddings spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
            );
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
              expect(span.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBeUndefined();
            }

            const errorSpan = spans.find(span => span.name === 'embeddings error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.embeddings');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates google genai embeddings spans with genAI recording enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.google_genai',
            );
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-004',
              'embeddings text-embedding-004',
            ]);

            const stringInputSpan = spans.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'What is the capital of France?',
            );
            expect(stringInputSpan!.name).toBe('embeddings text-embedding-004');
            expect(stringInputSpan!.status).toBe('ok');
            expect(stringInputSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
            expect(stringInputSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('google_genai');

            const errorSpan = spans.find(span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'This will fail');
            expect(errorSpan!.name).toBe('embeddings error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');

            const arrayInputSpan = spans.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value ===
                '[{"role":"user","parts":[{"text":"First input text"}]},{"role":"user","parts":[{"text":"Second input text"}]}]',
            );
            expect(arrayInputSpan!.name).toBe('embeddings text-embedding-004');
            expect(arrayInputSpan!.status).toBe('ok');
            expect(arrayInputSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
          },
        })
        .start()
        .completed();
    });
  });
});
