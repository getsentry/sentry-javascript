import type { SerializedStreamedSpanContainer } from '@sentry/core';
import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests, createEsmTests } from '../../../../utils/runner';

const matrix = [
  ['6', '^6.0.0'],
  ['7', '^7.0.0'],
] as const;

describe.each(matrix)('Vercel AI integration (version %s)', (version, vercelAiVersion) => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const expectedOrigin = 'auto.vercelai.channel';

  // We only run this in ESM and CJS to verify full support
  // Other suites we only run in ESM to simplify the test setup
  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates ai spans for dataCollection defaults', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              expect(spans).toHaveLength(7);
              const firstInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the first span?"}]',
              )!;
              expect(firstInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'invoke_agent',
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 30,
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 20,
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(firstInvokeAgentSpan.status).toBe('ok');
              expect(firstInvokeAgentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan.attributes['vercel.ai.operationId']?.value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              const firstGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  (span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string | undefined)?.includes('First span here!'),
              )!;
              expect(firstGenerateContentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'generate_content',
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 30,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 20,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 10,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(firstGenerateContentSpan.status).toBe('ok');
              expect(firstGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan.attributes['vercel.ai.operationId']?.value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
              expect(firstGenerateContentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]).toEqual({
                type: 'string',
                value:
                  '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              });

              const secondInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              )!;
              expect(secondInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'invoke_agent',
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 183,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 92,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 91,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]).toEqual({
                type: 'string',
                value:
                  '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toEqual({
                type: 'string',
                value: '[{"role":"user","content":"Where is the second span?"}]',
              });
              expect(secondInvokeAgentSpan.status).toBe('ok');
              expect(secondInvokeAgentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');

              const secondGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  (span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string | undefined)?.includes('Second span here!'),
              )!;
              expect(secondGenerateContentSpan.status).toBe('ok');
              expect(secondGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              )!;
              expect(toolInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
              expect(toolInvokeAgentSpan!.attributes[SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.invoke_agent',
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'invoke_agent',
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 40,
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 25,
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]).toEqual({
                type: 'string',
                value:
                  '[{"role":"assistant","parts":[{"type":"tool_call","id":"call-1","name":"getWeather","arguments":"{\\"location\\":\\"San Francisco\\"}"}],"finish_reason":"tool_call"}]',
              });
              expect(toolInvokeAgentSpan.status).toBe('ok');

              const toolGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_TOOL_DEFINITIONS] !== undefined,
              )!;
              expect(toolGenerateContentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'generate_content',
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 40,
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 25,
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(toolGenerateContentSpan.status).toBe('ok');
              expect(toolGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(toolGenerateContentSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toEqual({
                type: 'string',
                value: expect.stringContaining('getWeather'),
              });
              expect(toolGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(15);

              const toolExecutionSpan = spans.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolExecutionSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
              expect(toolExecutionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'execute_tool',
              });
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toEqual({
                type: 'string',
                value: 'call-1',
              });
              expect(toolExecutionSpan.status).toBe('ok');
              expect(toolExecutionSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_NAME]?.value).toBe('getWeather');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_DESCRIPTION]?.value).toBe(
                'Get the current weather for a location',
              );
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]).toBeDefined();
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_CALL_RESULT]).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai spans when dataCollection.genAi has inputs and outputs disabled', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              expect(spans).toHaveLength(7);
              const firstInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 10,
              )!;
              expect(firstInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'invoke_agent',
              });
              expect(firstInvokeAgentSpan.status).toBe('ok');
              expect(firstInvokeAgentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              expect(firstInvokeAgentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);

              const firstGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 10,
              )!;
              expect(firstGenerateContentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'generate_content',
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 30,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 20,
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(firstGenerateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(firstGenerateContentSpan.status).toBe('ok');
              expect(firstGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('mock-provider');

              const secondInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 91,
              )!;

              expect(secondInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'invoke_agent',
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 183,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 92,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 91,
              });
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(secondInvokeAgentSpan.status).toBe('ok');
              expect(secondInvokeAgentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');
              expect(secondInvokeAgentSpan.attributes[GEN_AI_INPUT_MESSAGES]?.value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              );

              const secondGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 91,
              )!;
              expect(secondGenerateContentSpan.status).toBe('ok');
              expect(secondGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(secondGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
              expect(secondGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES]?.value as string).toContain(
                'Where is the second span?',
              );
              expect(secondGenerateContentSpan.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string).toContain(
                'Second span here!',
              );

              const toolInvokeAgentSpan = spans.find(
                span => span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
              )!;
              expect(toolInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
              expect(toolInvokeAgentSpan!.attributes[SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.invoke_agent',
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'invoke_agent',
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 40,
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 25,
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(toolInvokeAgentSpan.status).toBe('ok');

              const toolGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
              )!;
              expect(toolGenerateContentSpan!.attributes[SENTRY_ORIGIN]).toEqual({
                type: 'string',
                value: expectedOrigin,
              });
              expect(toolGenerateContentSpan!.attributes[SENTRY_OP]).toEqual({
                type: 'string',
                value: 'gen_ai.generate_content',
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'generate_content',
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
                type: 'integer',
                value: 40,
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 25,
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
                type: 'integer',
                value: 15,
              });
              expect(toolGenerateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
                type: 'string',
                value: 'mock-model-id',
              });
              expect(toolGenerateContentSpan.status).toBe('ok');

              const toolExecutionSpan = spans.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolExecutionSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
              expect(toolExecutionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
                type: 'string',
                value: 'execute_tool',
              });
              expect(toolExecutionSpan.status).toBe('ok');
              expect(toolExecutionSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_NAME]?.value).toBe('getWeather');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call-1');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-error-in-tool.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures error in tool', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];
        let errorEvent: Event | undefined;

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .expect({
            event: event => {
              errorEvent = event;
            },
          })
          .start()
          .completed();

        const segment = receivedSpans.find(span => span.is_segment);
        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel');
        expect(spans).toHaveLength(3);
        const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent')!;
        expect(invokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
        expect(invokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
          type: 'string',
          value: 'invoke_agent',
        });
        expect(invokeAgentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');

        const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id')!;
        expect(generateContentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
        expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
          type: 'string',
          value: 'generate_content',
        });
        expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
          type: 'integer',
          value: 40,
        });
        expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
          type: 'integer',
          value: 25,
        });
        expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
          type: 'integer',
          value: 15,
        });
        expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
          type: 'string',
          value: 'mock-model-id',
        });
        expect(generateContentSpan.status).toBe('ok');
        expect(generateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');

        const toolSpan = spans.find(span => span.name === 'execute_tool getWeather')!;
        expect(toolSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
        expect(toolSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({ type: 'string', value: 'execute_tool' });
        expect(toolSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toEqual({ type: 'string', value: 'call-1' });
        expect(toolSpan.status).toBe('error');
        expect(toolSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.execute_tool');
        expect(toolSpan.attributes[GEN_AI_TOOL_NAME]?.value).toBe('getWeather');

        expect(segment!.name).toBe('main');

        expect(errorEvent!.level).toBe('error');
        expect(errorEvent!.tags).toEqual(
          expect.objectContaining({
            'vercel.ai.tool.name': 'getWeather',
            'vercel.ai.tool.callId': 'call-1',
          }),
        );

        // Trace id should be the same for the segment and error event
        expect(segment!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              expect(spans).toHaveLength(7);
              const invokeAgentSpans = spans.filter(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpans).toHaveLength(3);

              const generateContentSpans = spans.filter(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              );
              expect(generateContentSpans).toHaveLength(3);

              const toolSpan = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.execute_tool');
              expect(toolSpan).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-tool-loop-agent.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates spans for ToolLoopAgent with tool calls', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              expect(spans).toHaveLength(4);
              const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(invokeAgentSpan.status).toBe('ok');
              expect(invokeAgentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mock-model-id');

              const toolCallsGenerateContentSpan = spans.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value === '["tool-calls"]',
              )!;
              expect(toolCallsGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolCallsGenerateContentSpan.status).toBe('ok');
              expect(toolCallsGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(toolCallsGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
              expect(toolCallsGenerateContentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);

              const toolSpan = spans.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolSpan.status).toBe('ok');
              expect(toolSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes[GEN_AI_TOOL_NAME]?.value).toBe('getWeather');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call-1');

              const finalGenerateContentSpan = spans.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value === '["stop"]',
              )!;
              expect(finalGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(finalGenerateContentSpan.status).toBe('ok');
              expect(finalGenerateContentSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(finalGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(15);
              expect(finalGenerateContentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(25);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-concurrent.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('parents concurrent calls that share one model instance correctly', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const invokeAgents = spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent');
              const generateContents = spans.filter(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              );

              // Two concurrent operations -> two invoke_agent + two generate_content spans.
              expect(invokeAgents).toHaveLength(2);
              expect(generateContents).toHaveLength(2);

              const agentSpanIds = new Set(invokeAgents.map(span => span.span_id));

              // Each model call lands under an invoke_agent span...
              for (const span of generateContents) {
                expect(agentSpanIds.has(span.parent_span_id!)).toBe(true);
              }
              // ...a distinct one each (no cross-attribution despite the shared model instance)...
              expect(new Set(generateContents.map(span => span.parent_span_id)).size).toBe(2);
              // ...and both operations sit under the same `main` parent.
              expect(new Set(invokeAgents.map(span => span.parent_span_id)).size).toBe(1);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-concurrent-stream.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      // A single model instance shared by two concurrent `streamText` calls carries only one
      // captured-parent slot, so both model calls must still land under their own `invoke_agent` — not
      // collapse onto whichever operation resolved the shared model last.
      test('parents concurrent streamText calls that share one model instance correctly', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const invokeAgents = spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent');
              const generateContents = spans.filter(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              );

              // Two concurrent operations -> two invoke_agent + two generate_content spans.
              expect(invokeAgents).toHaveLength(2);
              expect(generateContents).toHaveLength(2);

              const agentSpanIds = new Set(invokeAgents.map(span => span.span_id));

              // Each model call lands under an invoke_agent span...
              for (const span of generateContents) {
                expect(agentSpanIds.has(span.parent_span_id!)).toBe(true);
              }
              // ...a distinct one each (no cross-attribution despite the shared model instance)...
              expect(new Set(generateContents.map(span => span.parent_span_id)).size).toBe(2);
              // ...and both operations sit under the same `main` parent.
              expect(new Set(invokeAgents.map(span => span.parent_span_id)).size).toBe(1);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-stream-text.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates streamText spans with the model call parented to invoke_agent', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const invokeAgent = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent')!;
              expect(invokeAgent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText');

              const generateContent = spans.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent.parent_span_id).toBe(invokeAgent.span_id);
              expect(generateContent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText.doStream');

              // The stream's final usage/finish/output arrive only as the stream drains, after the
              // channel already resolved the model call. Tapping the stream recovers them onto the
              // model-call span on every path (v7 channel, v6 OTel, v6 orchestrion).
              expect(generateContent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
              expect(generateContent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              expect(generateContent.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);
              expect(generateContent.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["stop"]');
              expect(generateContent.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Stream response!"}],"finish_reason":"stop"}]',
              );

              // The summed usage and output also land on the parent invoke_agent span, whose own
              // channel result is otherwise undefined for a stream.
              expect(invokeAgent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
              expect(invokeAgent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);
              expect(invokeAgent.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Stream response!"}],"finish_reason":"stop"}]',
              );
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-stream-tools.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures usage, tool calls and output across a multi-step streamText', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const invokeAgent = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent')!;
              expect(invokeAgent.status).toBe('ok');
              expect(invokeAgent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText');
              // Usage is summed across the two streamed model calls (10+15, 20+25, 30+40).
              expect(invokeAgent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(25);
              expect(invokeAgent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(45);
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(70);

              const generateContents = spans.filter(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              );
              expect(generateContents).toHaveLength(2);
              generateContents.forEach(span => expect(span.parent_span_id).toBe(invokeAgent.span_id));

              // The step that streamed a tool call: tool-call output part + tool-calls finish reason.
              const toolStep = generateContents.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value === '["tool-calls"]',
              )!;
              expect(toolStep.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);
              expect(toolStep.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              const toolStepOutput = toolStep.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string;
              expect(toolStepOutput).toContain('"type":"tool_call"');
              expect(toolStepOutput).toContain('getWeather');

              // The step that streamed the final answer text.
              const textStep = generateContents.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value === '["stop"]',
              )!;
              expect(textStep.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(15);
              expect(textStep.attributes[GEN_AI_OUTPUT_MESSAGES]?.value).toContain('Sunny, 72°F.');

              // A tool span is emitted for the streamed tool call. Its parent and recorded input/output
              // vary by path during stream consumption (tool i/o is covered by the non-stream scenario
              // and the v7 path), so here we just assert the span exists with the right name/status.
              const executeTool = spans.find(span => span.name === 'execute_tool getWeather')!;
              expect(executeTool.status).toBe('ok');
              expect(executeTool.attributes[GEN_AI_TOOL_NAME]?.value).toBe('getWeather');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-stream-structured-output.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures streamed structured output (streamText with experimental_output)', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const invokeAgent = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent')!;
              expect(invokeAgent.status).toBe('ok');
              expect(invokeAgent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText');
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);

              const generateContent = spans.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent.parent_span_id).toBe(invokeAgent.span_id);
              expect(generateContent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(12);
              expect(generateContent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(18);
              expect(generateContent.attributes[GEN_AI_RESPONSE_FINISH_REASONS]?.value).toBe('["stop"]');
              // The streamed JSON object is accumulated from the text deltas and captured as the
              // model's output text (embedded as an escaped JSON string in the output message).
              const output = generateContent.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string;
              expect(output).toContain('San Francisco');
              expect(output).toContain('sunny');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-rejected-model.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('finishes spans with an error status when the operation rejects', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              // The model throws, so the operation rejects. The spans must still be *finished* (and
              // therefore present in the transaction) with an error status — not left open.
              const invokeAgent = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent')!;
              expect(invokeAgent.status).toBe('error');

              const generateContent = spans.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent.status).toBe('error');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-provider-metadata.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('derives provider-metadata token breakdown and system instructions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const generateContent = spans.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              )!;

              // Cache/reasoning token breakdown is derived from the model's `providerMetadata` by the
              // channel subscriber, which v6 reaches through the orchestrion adapter, so the shape is the
              // same on both versions.
              expect(generateContent.attributes[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]?.value).toBe(5);
              expect(generateContent.attributes[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]?.value).toBe(7);
              // The per-response `responseId` is not a conversation id and must not be recorded as one.
              expect(generateContent.attributes[GEN_AI_CONVERSATION_ID]).toBeUndefined();

              const invokeAgent = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent')!;
              expect(invokeAgent).toBeDefined();

              // The system prompt is supplied via the v7-only `instructions` option. Only the channel
              // instrumentation surfaces it (as `gen_ai.system_instructions`); v6 has no such option.
              if (version === '7') {
                const expected = '[{"type":"text","content":"You are a helpful assistant."}]';
                expect(invokeAgent.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toBe(expected);
                expect(generateContent.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]?.value).toBe(expected);
              }
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-openai-conversation.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('derives gen_ai.conversation.id from the OpenAI `conversation` provider option', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const genAiSpans = container.items.filter(s =>
                String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'),
              );
              const conversationIdOf = (span: (typeof genAiSpans)[number]) =>
                span.attributes[GEN_AI_CONVERSATION_ID]?.value;
              const invokeAgentSpans = genAiSpans.filter(
                s => s.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpans).toHaveLength(4);
              const [firstTurn, secondTurn, chainedTurn, apiTurn] = invokeAgentSpans.sort(
                (a, b) => a.start_timestamp - b.start_timestamp,
              );

              // `providerOptions.openai.conversation` is the Conversations API id: the same on every turn.
              expect(conversationIdOf(firstTurn!)).toBe('conv_abc123');
              // The Azure Responses API uses the `azure` key for the same option.
              expect(conversationIdOf(secondTurn!)).toBe('conv_azure');
              // `previousResponseId` names a response rather than a thread, and the response's own
              // `responseId` is recorded as `gen_ai.response.id` only.
              expect(conversationIdOf(chainedTurn!)).toBeUndefined();
              // `Sentry.setConversationId()` beats the provider option.
              expect(conversationIdOf(apiTurn!)).toBe('conv-from-api');

              // Model-call and tool spans carry their operation's id, even though their start events
              // do not carry `providerOptions`.
              const modelCallSpans = genAiSpans.filter(
                s => s.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );
              expect(modelCallSpans.map(conversationIdOf).sort()).toEqual([
                'conv-from-api',
                'conv_abc123',
                'conv_azure',
                undefined,
              ]);
              const toolSpan = genAiSpans.find(s => s.attributes['sentry.op']?.value === 'gen_ai.execute_tool')!;
              expect(toolSpan).toBeDefined();
              expect(conversationIdOf(toolSpan)).toBe('conv_azure');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-cache-tokens.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('reads cache token counts from the SDK usage object', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              const generateContent = spans.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(120);
              expect(generateContent.attributes[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]?.value).toBe(80);
              expect(generateContent.attributes[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]?.value).toBe(20);

              const invokeAgent = spans.find(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent')!;
              expect(invokeAgent.attributes[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]?.value).toBe(80);
              expect(invokeAgent.attributes[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]?.value).toBe(20);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-embeddings.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      // `ai` v7 only routes `embed` through its telemetry tracing channel — `embedMany` is dispatched
      // via the callback-only path and never published — so the channel-based integration (v7 and v6
      // orchestrion) cannot see it there. On v6 both the OTel processor and the orchestrion channels
      // instrument `embedMany`, so its span is expected only on v6.
      const embedManyInstrumented = version === '6';

      test('creates embeddings spans for embed and embedMany', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );

              const embedSpan = spans.find(
                span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'Embedding test!',
              )!;
              expect(embedSpan.name).toBe('embeddings mock-model-id');
              expect(embedSpan.status).toBe('ok');
              expect(embedSpan.attributes[SENTRY_OP]?.value).toBe('gen_ai.embeddings');
              expect(embedSpan.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mock-model-id');
              expect(embedSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(10);

              const embedManySpan = spans.find(
                span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === '["First input","Second input"]',
              );
              if (embedManyInstrumented) {
                expect(embedManySpan!.name).toBe('embeddings mock-model-id');
                expect(embedManySpan!.status).toBe('ok');
                expect(embedManySpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.embeddings');
                expect(embedManySpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(20);
              } else {
                expect(embedManySpan).toBeUndefined();
              }
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-generate-object.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      // ai v7's native `ai:telemetry` channel does not publish a top-level `generateObject` operation
      // (like `embedMany`, it's dispatched via a path the channel never sees), so the channel-based
      // integration can't surface it on v7. v4/v5/v6 use orchestrion, which injects the `generateObject`
      // channel directly — v6 is exercised here, v4 in the base suite.
      test.skipIf(version === '7')('creates spans for generateObject', async () => {
        await createRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );

              const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent');
              expect(invokeAgentSpan!.status).toBe('ok');
              expect(invokeAgentSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes['vercel.ai.operationId']?.value).toBe('ai.generateObject');
              expect(invokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('mock-model-id');
              expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(15);
              expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(25);
              expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(40);

              const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
              expect(generateContentSpan!.status).toBe('ok');
              expect(generateContentSpan!.attributes[SENTRY_OP]?.value).toBe('gen_ai.generate_content');
              expect(generateContentSpan!.attributes['vercel.ai.operationId']?.value).toBe(
                'ai.generateObject.doGenerate',
              );
              expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mock-model-id');
              expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(15);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-aborted-stream-text.mjs',
    'instrument-abort.mjs',
    (createRunner, test) => {
      test('aborting a stream with a non-AbortError reason leaves no unhandled rejection', async () => {
        await createRunner().ensureNoErrorOutput().start().completed();
      });

      test('an aborted stream finishes its spans with an error status and no result attributes', async () => {
        await createRunner()
          .expect({
            span: container => {
              const invokeAgent = container.items.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent.status).toBe('error');
              expect(invokeAgent.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('mock-model-id');
              expect(invokeAgent.attributes[GEN_AI_RESPONSE_MODEL]).toBeUndefined();
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toBeUndefined();
              expect(invokeAgent.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();

              const generateContent = container.items.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent.status).toBe('error');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );
});

describe('Vercel AI integration experimental_evaluate', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    __dirname,
    'scenario-evaluate.mjs',
    'instrument-evaluate.mjs',
    (createRunner, test) => {
      test('creates an evaluate span', async () => {
        await createRunner()
          .expect({
            span: container => {
              const evaluateSpan = container.items.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.evaluate',
              )!;
              expect(evaluateSpan.name).toBe('evaluate typesafe-ai/jev');
              expect(evaluateSpan.status).toBe('ok');
              expect(evaluateSpan.attributes[SENTRY_ORIGIN]?.value).toBe('auto.vercelai.channel');
              expect(evaluateSpan.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('evaluate');
              expect(evaluateSpan.attributes[GEN_AI_PROVIDER_NAME]?.value).toBe('gateway');
              expect(evaluateSpan.attributes[GEN_AI_REQUEST_MODEL]?.value).toBe('typesafe-ai/jev');
              expect(evaluateSpan.attributes[GEN_AI_RESPONSE_MODEL]?.value).toBe('typesafe-ai/jev');
              expect(evaluateSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value).toBe(275);
              expect(evaluateSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]?.value).toBe(20);
              expect(evaluateSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(295);
              expect(JSON.parse(evaluateSpan.attributes[GEN_AI_INPUT_MESSAGES]?.value as string)).toEqual([
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
              expect(JSON.parse(evaluateSpan.attributes[GEN_AI_OUTPUT_MESSAGES]?.value as string)).toEqual([
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
        ai: '^7.0.111',
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-evaluate.mjs',
    'instrument-evaluate-no-recording.mjs',
    (createRunner, test) => {
      test('does not record inputs or outputs when recording is off', async () => {
        await createRunner()
          .expect({
            span: container => {
              const evaluateSpan = container.items.find(
                span => span.attributes[SENTRY_OP]?.value === 'gen_ai.evaluate',
              )!;
              expect(evaluateSpan.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
              expect(evaluateSpan.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
              // State, questions and answers must not come back through another attribute. Only the attributes
              // are checked (timestamps could match a number), and `probabilities` only occurs in answers.
              expect(JSON.stringify(evaluateSpan.attributes)).not.toMatch(
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
        ai: '^7.0.111',
      },
    },
  );
});

describe('Vercel AI telemetry metadata (v6)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-telemetry-metadata.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('records experimental_telemetry.metadata as span attributes', async () => {
        await createRunner()
          .expect({
            span: container => {
              for (const [name, op, requestId] of [
                ['invoke_agent support-chat', 'gen_ai.invoke_agent', 'req_generate'],
                ['generate_content mock-model-id', 'gen_ai.generate_content', 'req_generate'],
                ['invoke_agent support-stream', 'gen_ai.invoke_agent', 'req_stream'],
                ['generate_content mock-model-id', 'gen_ai.generate_content', 'req_stream'],
                ['embeddings mock-model-id', 'gen_ai.embeddings', 'req_embed'],
                ['embeddings mock-model-id', 'gen_ai.embeddings', 'req_embed_many'],
              ]) {
                const span = container.items.find(
                  span =>
                    span.name === name &&
                    span.attributes['vercel.ai.telemetry.metadata.requestId']?.value === requestId,
                );
                expect(span?.attributes[SENTRY_OP]).toEqual({ type: 'string', value: op });
                expect(span?.attributes['vercel.ai.telemetry.metadata.tenantId']).toEqual({
                  type: 'string',
                  value: 'acme',
                });
              }
              const generateSpans = container.items.filter(
                span => span.attributes['vercel.ai.telemetry.metadata.requestId']?.value === 'req_generate',
              );
              for (const span of generateSpans) {
                expect(span.attributes['vercel.ai.telemetry.metadata.attempt']).toEqual({ type: 'string', value: '2' });
              }
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^6.0.0' } },
  );
});
