import { afterAll, expect, describe } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import {
  GEN_AI_DECIDE,
  GEN_AI_EXECUTE_TOOL,
  GEN_AI_GENERATE_CONTENT,
  GEN_AI_INVOKE_AGENT,
} from '@sentry/conventions/op';
import { cleanupChildProcesses, createEsmAndCjsTests, createEsmTests } from '../../../../../../utils/runner';
import { registerVercelAiGenerationTests } from '../../suite';
import { join } from 'node:path';

describe('Vercel AI integration (version 7)', () => {
  registerVercelAiGenerationTests('7', '^7.0.0');
});

describe('Vercel AI integration experimental_decide', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-decide.mjs',
    'instrument-decide.mjs',
    (createRunner, test) => {
      test('creates a decide span', async () => {
        await createRunner()
          .expect({
            span: container => {
              const decideSpan = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_DECIDE)!;
              expect(decideSpan.name).toBe('decide typesafe-ai/jev');
              expect(decideSpan.status).toBe('ok');
              expect(decideSpan.attributes[SENTRY_ORIGIN]?.value).toBe('auto.ai.vercelai');
              expect(decideSpan.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('decide');
              expect(decideSpan.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('gateway');
              expect(decideSpan.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('typesafe-ai/jev');
              expect(decideSpan.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('typesafe-ai/jev');
              expect(decideSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(275);
              expect(decideSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              expect(decideSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(295);
              expect(JSON.parse(decideSpan.attributes[GEN_AI_INPUT_MESSAGES]?.value as string)).toEqual([
                {
                  type: 'evaluation',
                  state: 'I cannot log in, and I also want a refund for last month.',
                  questions: {
                    authIssue: { type: 'boolean', instructions: 'Is there a login problem?' },
                    department: {
                      type: 'choice',
                      instructions: 'Which team should handle this?',
                      criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' },
                    },
                    wantsRefund: { type: 'boolean', instructions: 'Is a refund requested?' },
                    urgency: {
                      type: 'score',
                      instructions: 'How urgent is this ticket?',
                      criteria: ['low', 'medium', 'high'],
                    },
                  },
                },
              ]);
              expect(JSON.parse(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string)).toEqual([
                {
                  type: 'evaluation',
                  answers: {
                    authIssue: { type: 'boolean', probability: 0.97 },
                    department: {
                      type: 'choice',
                      choice: 'billing',
                      probabilities: { billing: 0.64, technical: 0.36 },
                      confidence: 0.28,
                    },
                    wantsRefund: { type: 'boolean', probability: 0.99 },
                    urgency: { type: 'score', score: 1.8, probabilities: { 0: 0, 1: 0.2, 2: 0.8 } },
                  },
                },
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.128',
      },
    },
  );

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-decide.mjs',
    'instrument-decide-no-recording.mjs',
    (createRunner, test) => {
      test('does not record inputs or outputs when recording is off', async () => {
        await createRunner()
          .expect({
            span: container => {
              const decideSpan = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_DECIDE)!;
              expect(decideSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
              expect(decideSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
              // State, questions and answers must not come back through another attribute. Only the attributes
              // are checked (timestamps could match a number), and `probabilities` only occurs in answers.
              expect(JSON.stringify(decideSpan.attributes)).not.toMatch(
                /cannot log in|Charges and refunds|probabilities/,
              );
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.128',
      },
    },
  );
});

describe('Vercel AI runtime and tool context (v7)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-runtime-context.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('records the context keys included in telemetry as span attributes', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.vercelai',
              );
              // Keys left out of `includeRuntimeContext`/`includeToolsContext` must not reach any span.
              expect(JSON.stringify(spans)).not.toMatch(/secret-runtime|secret-tool|apiToken|apiKey/);

              const generateSpans = spans.filter(
                span => span.attributes['vercel.ai.settings.context.requestId']?.value === 'req_generate',
              );
              expect(generateSpans.map(span => span.attributes[SENTRY_OP]?.value).sort()).toEqual([
                GEN_AI_EXECUTE_TOOL,
                GEN_AI_GENERATE_CONTENT,
                GEN_AI_GENERATE_CONTENT,
                GEN_AI_INVOKE_AGENT,
              ]);
              for (const span of generateSpans) {
                expect(span.attributes['vercel.ai.settings.context.tenantId']).toEqual({
                  type: 'string',
                  value: 'acme',
                });
              }

              const toolSpan = generateSpans.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
              expect(toolSpan?.attributes['vercel.ai.tool_call.context.units']).toEqual({
                type: 'string',
                value: 'metric',
              });

              const streamSpans = spans.filter(
                span => span.attributes['vercel.ai.settings.context.requestId']?.value === 'req_stream',
              );
              expect(streamSpans.map(span => span.attributes[SENTRY_OP]?.value).sort()).toEqual([
                GEN_AI_GENERATE_CONTENT,
                GEN_AI_INVOKE_AGENT,
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.154' } },
  );
});

describe('Vercel AI calls with recording off (v7)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-no-recording.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('captures usage and tool errors for calls with recordInputs/recordOutputs: false', async () => {
        await createRunner()
          .unordered()
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]).toMatchObject({
                value: 'Error in tool',
                mechanism: { type: 'auto.ai.vercelai', handled: false },
              });
            },
          })
          .expect({
            span: container => {
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.vercelai',
              );
              const modelCalls = spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_GENERATE_CONTENT);
              expect(modelCalls).toHaveLength(2);
              for (const modelCall of modelCalls) {
                expect(modelCall.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
                expect(modelCall.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
                expect(modelCall.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["tool-calls"]');
                expect(modelCall.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
                expect(modelCall.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
              }

              const streamAgent = spans.find(
                span => span.attributes['vercel.ai.operationId']?.value === 'ai.streamText',
              )!;
              expect(streamAgent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
              expect(streamAgent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);

              const toolSpans = spans.filter(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
              expect(toolSpans).toHaveLength(2);
              toolSpans.forEach(span => expect(span.status).toBe('error'));
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.163' } },
  );

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-no-recording.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records output messages when only recordInputs is false', async () => {
        await createRunner()
          .withEnv({ RECORD_OUTPUTS: '1' })
          .unordered()
          .expect({
            span: container => {
              const modelCalls = container.items.filter(
                span => span.attributes[SENTRY_OP]?.value === GEN_AI_GENERATE_CONTENT,
              );
              expect(modelCalls).toHaveLength(2);
              for (const modelCall of modelCalls) {
                expect(modelCall.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
                expect(modelCall.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toContain('getWeather');
              }
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.163' } },
  );

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-no-recording.mjs',
    'instrument-eve.mjs',
    (createRunner, test) => {
      test('records usage but no output messages under eve when ai withheld the result', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const modelCalls = container.items.filter(
                span => span.attributes[SENTRY_OP]?.value === GEN_AI_GENERATE_CONTENT,
              );
              expect(modelCalls).toHaveLength(2);
              for (const modelCall of modelCalls) {
                expect(modelCall.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
                expect(modelCall.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
              }

              const streamAgent = container.items.find(
                span => span.attributes['vercel.ai.operationId']?.value === 'ai.streamText',
              )!;
              expect(streamAgent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
              expect(streamAgent.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();

              const toolSpans = container.items.filter(
                span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL,
              );
              toolSpans.forEach(span => expect(span.attributes[GEN_AI_TOOL_CALL_RESULT]).toBeUndefined());
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.163' } },
  );

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-no-recording.mjs',
    'instrument-unsampled.mjs',
    (createRunner, test) => {
      test('captures the real tool error in an unsampled trace with recordInputs/recordOutputs: false', async () => {
        await createRunner()
          .withEnv({ UNSAMPLED: '1' })
          .unordered()
          .expect({
            event: event => {
              expect(event.exception?.values?.[0]).toMatchObject({
                value: 'Error in tool',
                mechanism: { type: 'auto.ai.vercelai', handled: false },
              });
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.163' } },
  );

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-error-in-tool.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records no tool call result for a failed tool, since the span status and error event carry it', async () => {
        await createRunner()
          .unordered()
          .expect({
            span: container => {
              const toolSpan = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_EXECUTE_TOOL);
              expect(toolSpan?.status).toBe('error');
              expect(toolSpan?.attributes[GEN_AI_TOOL_CALL_RESULT]).toBeUndefined();
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.163' } },
  );
});

describe('Vercel AI recording functions (v7)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    join(__dirname, '../..'),
    'scenario-recording-functions.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per span when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const recorded = (operationId: string): { inputs: boolean; outputs: boolean }[] =>
                container.items
                  .filter(span => span.attributes['vercel.ai.operationId']?.value === operationId)
                  .map(span => ({
                    inputs: GEN_AI_INPUT_MESSAGES in span.attributes,
                    outputs: GEN_AI_OUTPUT_MESSAGES in span.attributes,
                  }));

              // `recordOutputs` skips `generateText` by type; the scope tag decides the rest.
              expect(recorded('ai.generateText')).toEqual([
                { inputs: true, outputs: false },
                { inputs: false, outputs: false },
              ]);
              expect(recorded('ai.generateText.doGenerate')).toEqual([
                { inputs: true, outputs: true },
                { inputs: false, outputs: false },
              ]);
              // The scenario makes the scope private while the stream is read, after both spans started.
              expect(recorded('ai.streamText')).toEqual([{ inputs: true, outputs: true }]);
              expect(recorded('ai.streamText.doStream')).toEqual([{ inputs: true, outputs: true }]);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.0' } },
  );
});

describe('Vercel AI span hooks (v7)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-recording-functions.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks at start in the caller context and at end after the response attributes', async () => {
        await createRunner()
          .expect({
            span: container => {
              const hooks = container.items
                .filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.vercelai')
                .map(span => [
                  span.attributes['vercel.ai.operationId']?.value,
                  span.attributes['test.start']?.value,
                  span.attributes['test.end']?.value,
                ]);
              expect(hooks.sort()).toEqual([
                ['ai.generateText', 'generateText:private', '30:response'],
                ['ai.generateText', 'generateText:public', '30:response'],
                ['ai.generateText.doGenerate', 'languageModelCall:private', '30:response'],
                ['ai.generateText.doGenerate', 'languageModelCall:public', '30:response'],
                ['ai.streamText', 'streamText:public', '30:no response'],
                ['ai.streamText.doStream', 'languageModelCall:public', '30:no response'],
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^7.0.0' } },
  );
});
