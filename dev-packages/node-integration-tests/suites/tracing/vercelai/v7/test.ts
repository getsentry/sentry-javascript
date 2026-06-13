import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Vercel AI integration (V7 - diagnostic channel)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai spans via diagnostic channel without sendDefaultPii', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // 2 generateText calls (3rd is disabled) × (invoke_agent + generate_content) + 1 tool = 5
              expect(container.items).toHaveLength(5);

              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              );
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(20);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(30);
              // No PII — messages should not be recorded
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              );
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE].value).toBe('function');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates ai spans with sendDefaultPii: true', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(5);

              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              );
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]).toBeDefined();

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.attributes['sentry.op']?.value === 'gen_ai.generate_content' &&
                  span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] !== undefined,
              );
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeDefined();
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error-in-tool.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures error in tool', async () => {
        let transactionEvent: Event | undefined;
        let errorEvent: Event | undefined;

        await createRunner()
          .expect({
            transaction: transaction => {
              transactionEvent = transaction;
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(3);

              const invokeAgentSpan = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpan).toBeDefined();

              const generateContentSpan = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );
              expect(generateContentSpan).toBeDefined();

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolSpan).toBeDefined();
              expect(toolSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
            },
          })
          .expect({
            event: event => {
              errorEvent = event;
            },
          })
          .start()
          .completed();

        expect(transactionEvent).toBeDefined();
        expect(transactionEvent!.transaction).toBe('main');

        expect(errorEvent).toBeDefined();
        expect(errorEvent!.level).toBe('error');
        expect(errorEvent!.tags).toEqual(
          expect.objectContaining({
            'vercel.ai.tool.name': 'getWeather',
            'vercel.ai.tool.callId': 'call-1',
          }),
        );

        expect(transactionEvent!.contexts!.trace!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tool-loop-agent.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates spans for ToolLoopAgent with tool calls', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(4);

              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent');
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');

              const toolCallsGenerateContentSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["tool_call"]',
              );
              expect(toolCallsGenerateContentSpan).toBeDefined();
              expect(toolCallsGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(toolCallsGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(toolCallsGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(toolCallsGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(20);

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolSpan).toBeDefined();
              expect(toolSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
              expect(toolSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
              expect(toolSpan!.attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE].value).toBe('function');

              const finalGenerateContentSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["stop"]',
              );
              expect(finalGenerateContentSpan).toBeDefined();
              expect(finalGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(finalGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(finalGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);
              expect(finalGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(25);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-stream-text.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates spans for streamText', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);

              const invokeAgentSpan = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');

              const generateContentSpan = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan!.name).toBe('generate_content mock-model-id');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-embed.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates spans for embed', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);

              const embedSpan = container.items[0];
              expect(embedSpan).toBeDefined();
              expect(embedSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
              expect(embedSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
              expect(embedSpan!.name).toBe('embeddings mock-model-id');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-disabled.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('does not create spans when telemetry is disabled', async () => {
        await createRunner()
          .expect({
            transaction: transaction => {
              expect(transaction.transaction).toBe('main');
              expect(transaction.spans).toHaveLength(0);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^7.0.0-canary',
      },
    },
  );
});
