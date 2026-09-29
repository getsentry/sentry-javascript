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
    ['automatic', 'scenario.mjs', 'instrument.mjs', 'instrument-no-recording.mjs'],
    ['manual', 'scenario-manual.mjs', 'instrument-manual.mjs', 'instrument-manual-no-recording.mjs'],
  ])('%s instrumentation', (_, scenarioFile, instrumentFile, noRecordingInstrumentFile) => {
    createEsmAndCjsTests(
      __dirname,
      scenarioFile,
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
                expect(evaluateSpans).toHaveLength(4);
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
                      department: {
                        type: 'choice',
                        instructions: 'Which team should handle this?',
                        criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' },
                      },
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
                      department: {
                        type: 'choice',
                        choice: 'billing',
                        confidence: 0.28,
                        probabilities: { billing: 0.64, technical: 0.36 },
                      },
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

                const validationErrorSpan = evaluateSpans.find(span => span.name === 'evaluate validation-error')!;
                expect(validationErrorSpan).toBeDefined();
                expect(validationErrorSpan.status).toBe('error');
                expect(validationErrorSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
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

    createEsmAndCjsTests(
      __dirname,
      scenarioFile,
      noRecordingInstrumentFile,
      (createRunner, test) => {
        test('does not record inputs or outputs when recording is off', async () => {
          await createRunner()
            .unordered()
            .expect({
              span: container => {
                const evaluateSpans = container.items.filter(
                  span => span.attributes[SENTRY_OP]?.value === 'gen_ai.evaluate',
                );
                expect(evaluateSpans).toHaveLength(4);
                expect(evaluateSpans.filter(span => span.status === 'error')).toHaveLength(2);
                for (const span of evaluateSpans) {
                  expect(span.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
                  expect(span.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
                  // State, questions and answers must not come back through another attribute (e.g. an error message).
                  // Only the attributes are checked (timestamps could match a number), and `probabilities` only
                  // occurs in answers.
                  expect(JSON.stringify(span.attributes)).not.toMatch(
                    /cannot log in|Charges and refunds|probabilities/,
                  );
                }
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
