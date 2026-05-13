import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Vercel AI integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
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
            expect(secondGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(secondGenerateContentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'Second span here!',
            );

            const toolInvokeAgentSpan = container.items.find(
              span =>
                span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
            );
            expect(toolInvokeAgentSpan).toBeDefined();
            expect(toolInvokeAgentSpan!.name).toBe('invoke_agent');
            expect(toolInvokeAgentSpan!.status).toBe('ok');
            expect(toolInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(40);

            const toolGenerateContentSpan = container.items.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
            );
            expect(toolGenerateContentSpan).toBeDefined();
            expect(toolGenerateContentSpan!.name).toBe('generate_content mock-model-id');
            expect(toolGenerateContentSpan!.status).toBe('ok');
            expect(toolGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);

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
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
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
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
              '[{"role":"user","content":"Where is the second span?"}]',
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
                span.name === 'invoke_agent' &&
                span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                  '[{"role":"user","content":"What is the weather in San Francisco?"}]',
            );
            expect(toolInvokeAgentSpan).toBeDefined();
            expect(toolInvokeAgentSpan!.name).toBe('invoke_agent');
            expect(toolInvokeAgentSpan!.status).toBe('ok');
            expect(toolInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
              '[{"role":"user","content":"What is the weather in San Francisco?"}]',
            );
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]).toBeDefined();

            const toolGenerateContentSpan = container.items.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]?.value?.includes('getWeather'),
            );
            expect(toolGenerateContentSpan).toBeDefined();
            expect(toolGenerateContentSpan!.name).toBe('generate_content mock-model-id');
            expect(toolGenerateContentSpan!.status).toBe('ok');
            expect(toolGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(toolGenerateContentSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toContain(
              'getWeather',
            );
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
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures error in tool', async () => {
      let traceId: string = 'unset-trace-id';
      let spanId: string = 'unset-span-id';

      await createRunner()
        .expect({
          transaction: transaction => {
            expect(transaction.transaction).toBe('main');
            // gen_ai spans should be empty in transaction
            expect(transaction.spans).toEqual([]);
            traceId = transaction.contexts!.trace!.trace_id;
            spanId = transaction.contexts!.trace!.span_id;
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const invokeAgentSpan = container.items.find(
              span => span.name === 'invoke_agent' && span.status === 'error',
            );
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.name).toBe('invoke_agent');
            expect(invokeAgentSpan!.status).toBe('error');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');

            const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.name).toBe('generate_content mock-model-id');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText.doGenerate');

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
            expect(event.exception?.values).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'AI_ToolExecutionError',
                  value: 'Error executing tool getWeather: Error in tool',
                }),
              ]),
            );
            expect(event.tags).toMatchObject({ 'test-tag': 'test-value' });
            expect(event.contexts!.trace!.trace_id).toBe(traceId);
            expect(event.contexts!.trace!.span_id).toBe(spanId);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool-express.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures error in tool in express server', async () => {
      let transactionEvent: Event | undefined;
      let errorEvent: Event | undefined;

      const runner = createRunner()
        .expect({
          transaction: transaction => {
            transactionEvent = transaction;
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const invokeAgentSpan = container.items.find(
              span => span.name === 'invoke_agent' && span.status === 'error',
            );
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.name).toBe('invoke_agent');
            expect(invokeAgentSpan!.status).toBe('error');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');

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
        .start();

      await runner.makeRequest('get', '/test/error-in-tool', { expectError: true });
      await runner.completed();

      expect(transactionEvent).toBeDefined();
      expect(transactionEvent!.transaction).toBe('GET /test/error-in-tool');
      expect(transactionEvent!.tags).toMatchObject({ 'test-tag': 'test-value' });

      expect(errorEvent).toBeDefined();
      expect(errorEvent!.exception?.values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AI_ToolExecutionError',
            value: 'Error executing tool getWeather: Error in tool',
          }),
        ]),
      );
      expect(errorEvent!.tags).toMatchObject({ 'test-tag': 'test-value' });
      expect(errorEvent!.contexts!.trace!.trace_id).toBe(transactionEvent!.contexts!.trace!.trace_id);
      expect(errorEvent!.contexts!.trace!.span_id).toBe(transactionEvent!.contexts!.trace!.span_id);
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-late-model-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sets op correctly even when model ID is not available at span start', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent');
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.name).toBe('invoke_agent');
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['sentry.origin'].value).toBe('auto.vercelai.otel');
            expect(invokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('invoke_agent');

            const generateContentSpan = container.items.find(span => span.name === 'generateText.doGenerate');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.name).toBe('generateText.doGenerate');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['sentry.origin'].value).toBe('auto.vercelai.otel');
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent');
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.name).toBe('invoke_agent');
              expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );

              const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id');
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-message-truncation.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates messages when they exceed byte limit', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(4);
              const truncatedInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.match(/^\[.*"(?:text|content)":"C+".*\]$/),
              );
              expect(truncatedInvokeAgentSpan).toBeDefined();
              expect(truncatedInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(truncatedInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(truncatedInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(
                3,
              );
              expect(truncatedInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[.*"(?:text|content)":"C+".*\]$/,
              );

              const smallMessageInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(
                    'This is a small message that fits within the limit',
                  ),
              );
              expect(smallMessageInvokeAgentSpan).toBeDefined();
              expect(smallMessageInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(smallMessageInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(
                smallMessageInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value,
              ).toBe(3);
              expect(smallMessageInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
                'This is a small message that fits within the limit',
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates embedding related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const embedSpan = container.items.find(
              span => span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
            );
            expect(embedSpan).toBeDefined();
            expect(embedSpan!.name).toBe('embeddings mock-model-id');
            expect(embedSpan!.status).toBe('ok');
            expect(embedSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(embedSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
            expect(embedSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);

            const embedManySpan = container.items.find(
              span => span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 20,
            );
            expect(embedManySpan).toBeDefined();
            expect(embedManySpan!.name).toBe('embeddings mock-model-id');
            expect(embedManySpan!.status).toBe('ok');
            expect(embedManySpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(embedManySpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(20);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates embedding related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const embedSpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'Embedding test!',
            );
            expect(embedSpan).toBeDefined();
            expect(embedSpan!.name).toBe('embeddings mock-model-id');
            expect(embedSpan!.status).toBe('ok');
            expect(embedSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(embedSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe('Embedding test!');

            const embedManySpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === '["First input","Second input"]',
            );
            expect(embedManySpan).toBeDefined();
            expect(embedManySpan!.name).toBe('embeddings mock-model-id');
            expect(embedManySpan!.status).toBe('ok');
            expect(embedManySpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(embedManySpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe(
              '["First input","Second input"]',
            );
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-conversation-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('does not overwrite conversation id set via Sentry.setConversationId with responseId from provider metadata', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent');
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.name).toBe('invoke_agent');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['gen_ai.conversation.id'].value).toBe('conv-a');

            const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan).toBeDefined();
            expect(generateContentSpan!.name).toBe('generate_content mock-model-id');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['gen_ai.conversation.id'].value).toBe('conv-a');
          },
        })
        .start()
        .completed();
    });
  });

  const longContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(
    __dirname,
    'scenario-no-truncation.mjs',
    'instrument-no-truncation.mjs',
    (createRunner, test) => {
      test('does not truncate input messages when enableTruncation is false', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const invokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    JSON.stringify([
                      { role: 'user', content: longContent },
                      { role: 'assistant', content: 'Some reply' },
                      { role: 'user', content: 'Follow-up question' },
                    ]),
              );
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.name).toBe('invoke_agent');
              expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([
                  { role: 'user', content: longContent },
                  { role: 'assistant', content: 'Some reply' },
                  { role: 'user', content: 'Follow-up question' },
                ]),
              );
              expect(invokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id');
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            },
          })
          .start()
          .completed();
      });
    },
  );
});
