import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Vercel AI integration (V6)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans with sendDefaultPii: false', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes['vercel.ai.operationId'].value === 'ai.generateText' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value === 10,
              );
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan!.status).toBe('ok');
              expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(20);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(30);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId'].value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] === undefined,
              );
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan!.status).toBe('ok');
              expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes['vercel.ai.operationId'].value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('mock-provider');
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan!.status).toBe('ok');
              expect(secondInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              );

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value?.includes('Second span here!'),
              );
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan!.status).toBe('ok');
              expect(secondGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
              );
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan!.status).toBe('ok');

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
              );
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan!.status).toBe('ok');

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan!.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan!.status).toBe('ok');
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
        ai: '^6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates ai related spans with sendDefaultPii: true', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan!.status).toBe('ok');
              expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value?.includes('First span here!'),
              );
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan!.status).toBe('ok');
              expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes['vercel.ai.operationId'].value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
              expect(firstGenerateContentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toContain(
                'First span here!',
              );

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan!.status).toBe('ok');
              expect(secondInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value?.includes('Second span here!'),
              );
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan!.status).toBe('ok');
              expect(secondGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan!.status).toBe('ok');
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] !== undefined,
              );
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan!.status).toBe('ok');
              expect(toolGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(toolGenerateContentSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeDefined();
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan!.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan!.status).toBe('ok');
              expect(toolExecutionSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE].value).toBe(
                'Get the current weather for a location',
              );
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_INPUT_ATTRIBUTE]).toBeDefined();
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_OUTPUT_ATTRIBUTE]).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^6.0.0',
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
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent');
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.name).toBe('invoke_agent');
              expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

              const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id');
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(generateContentSpan!.status).toBe('ok');
              expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolSpan).toBeDefined();
              expect(toolSpan!.name).toBe('execute_tool getWeather');
              expect(toolSpan!.status).toBe('error');
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

        // Trace id should be the same for the transaction and error event
        expect(transactionEvent!.contexts!.trace!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
      });
    },
    {
      additionalDependencies: {
        ai: '^6.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans with v6', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const invokeAgentSpans = container.items.filter(
                span => span.attributes['sentry.op'].value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpans).toHaveLength(3);

              const generateContentSpans = container.items.filter(
                span => span.attributes['sentry.op'].value === 'gen_ai.generate_content',
              );
              expect(generateContentSpans).toHaveLength(3);

              const toolSpan = container.items.find(
                span => span.attributes['sentry.op'].value === 'gen_ai.execute_tool',
              );
              expect(toolSpan).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '^6.0.0',
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
              expect(invokeAgentSpan!.name).toBe('invoke_agent weather_agent');
              expect(invokeAgentSpan!.status).toBe('ok');
              expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');

              const toolCallsGenerateContentSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["tool-calls"]',
              );
              expect(toolCallsGenerateContentSpan).toBeDefined();
              expect(toolCallsGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(toolCallsGenerateContentSpan!.status).toBe('ok');
              expect(toolCallsGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(toolCallsGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(toolCallsGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(20);

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolSpan).toBeDefined();
              expect(toolSpan!.name).toBe('execute_tool getWeather');
              expect(toolSpan!.status).toBe('ok');
              expect(toolSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
              expect(toolSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
              expect(toolSpan!.attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE].value).toBe('function');

              const finalGenerateContentSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["stop"]',
              );
              expect(finalGenerateContentSpan).toBeDefined();
              expect(finalGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(finalGenerateContentSpan!.status).toBe('ok');
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
        ai: '^6.0.0',
      },
    },
  );
});
