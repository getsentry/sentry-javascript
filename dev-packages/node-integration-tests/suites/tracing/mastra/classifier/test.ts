import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import { afterAll, expect, describe } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { supports } from '../../../../utils';
import { join } from 'node:path';
import { MASTRA_CLASSIFIER_DEPENDENCIES } from '../dependencies';

describe.runIf(supports({ min: 22 }))('Mastra integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-classifier.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('maps a classifier evaluation to a gen_ai.decide span', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name)).toEqual(['decide jev-latest']);

              const decideSpan = spans[0]!;
              expect(decideSpan.attributes[SENTRY_OP].value).toBe(GEN_AI_DECIDE);
              expect(decideSpan.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.mastra');
              expect(decideSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('decide');
              expect(decideSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe('jev-latest');
              expect(decideSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('typesafe-ai.evaluation');
              expect(decideSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(30);
              expect(decideSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(2);
              expect(decideSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(32);
              expect(decideSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
              expect(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_CLASSIFIER_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-classifier.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records the evaluated state, questions and answers when genAI recording is on', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const decideSpan = container.items.find(span => span.name === 'decide jev-latest')!;
              expect(JSON.parse(decideSpan.attributes[GEN_AI_INPUT_MESSAGES].value)).toEqual([
                {
                  type: 'evaluation',
                  state: { message: 'I was charged twice.', apiKey: '[REDACTED]' },
                  questions: {
                    urgent: { type: 'boolean', instructions: 'Does this request need an immediate response?' },
                  },
                },
              ]);
              expect(JSON.parse(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value)).toEqual([
                { type: 'evaluation', answers: { urgent: { type: 'boolean', probability: 0.9 } } },
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_CLASSIFIER_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-classifier-error.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('ends a failed classifier evaluation span with an error status', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name)).toEqual(['decide jev-latest']);

              const decideSpan = spans[0]!;
              expect(decideSpan.status).toBe('error');
              expect(decideSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('I was charged twice.');
              expect(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_CLASSIFIER_DEPENDENCIES,
  );
});
