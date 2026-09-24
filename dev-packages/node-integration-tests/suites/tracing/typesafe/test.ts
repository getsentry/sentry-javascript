import {
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
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('TypeSafe integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe.each([
    ['automatic', 'instrument.mjs'],
    ['manual', 'instrument-manual.mjs'],
  ])('%s instrumentation', (_, instrumentFile) => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      instrumentFile,
      (createRunner, test) => {
        test('creates evaluate spans for systemOne', async () => {
          await createRunner()
            .unordered()
            .expect({
              span: container => {
                const evaluateSpans = container.items.filter(
                  span => span.attributes[SENTRY_OP]?.value === 'gen_ai.evaluate',
                );
                expect(evaluateSpans).toHaveLength(3);
                for (const span of evaluateSpans) {
                  expect(span.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.typesafe');
                  expect(span.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('evaluate');
                  expect(span.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('typesafe');
                }

                const defaultModelSpan = evaluateSpans.find(span => span.name === 'evaluate jev-latest')!;
                expect(defaultModelSpan).toBeDefined();
                expect(defaultModelSpan.status).toBe('ok');
                expect(defaultModelSpan.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('jev-latest');
                expect(defaultModelSpan.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('jev-1.13.0');
                expect(defaultModelSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(275);
                expect(defaultModelSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
                expect(defaultModelSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(295);
                expect(JSON.parse(defaultModelSpan.attributes[GEN_AI_INPUT_MESSAGES]?.value as string)).toEqual([
                  {
                    type: 'evaluation',
                    state: 'I cannot log in, and I also want a refund for last month.',
                    questions: {
                      authIssue: { type: 'noul', instructions: 'Is there a login problem?' },
                      urgency: {
                        type: 'score',
                        instructions: 'How urgent is this ticket?',
                        criteria: ['low', 'medium', 'high'],
                      },
                    },
                  },
                ]);
                expect(JSON.parse(defaultModelSpan.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string)).toEqual([
                  {
                    type: 'evaluation',
                    answers: {
                      authIssue: { type: 'noul', noul: 0.98 },
                      urgency: {
                        type: 'score',
                        score: 1.58,
                        confidence: 0.9,
                        legend: { 0: 'low', 1: 'medium', 2: 'high' },
                        probabilities: { 0: 0, 1: 0.42, 2: 0.58 },
                      },
                    },
                  },
                ]);

                const asResponseSpan = evaluateSpans.find(span => span.name === 'evaluate jev-1.13')!;
                expect(asResponseSpan).toBeDefined();
                expect(asResponseSpan.status).toBe('ok');
                expect(asResponseSpan.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('jev-1.13.0');

                const errorSpan = evaluateSpans.find(span => span.name === 'evaluate error-model')!;
                expect(errorSpan).toBeDefined();
                expect(errorSpan.status).toBe('error');
                expect(errorSpan.attributes[GEN_AI_RESPONSE_MODEL]).toBeUndefined();
                expect(errorSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
              },
            })
            .start()
            .completed();
        });
      },
      {
        additionalDependencies: {
          '@typesafe-ai/sdk': '^0.6.0',
        },
      },
    );
  });
});
