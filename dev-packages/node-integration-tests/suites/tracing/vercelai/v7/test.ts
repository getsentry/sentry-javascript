import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_FUNCTION_ID_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Vercel AI integration (V7 tracing channel)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates tracing-channel spans without recording inputs by default', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(11);

            const weatherRoot = container.items.find(span => span.name === 'invoke_agent weather_agent');
            expect(weatherRoot).toBeDefined();
            expect(weatherRoot!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(weatherRoot!.attributes[GEN_AI_FUNCTION_ID_ATTRIBUTE].value).toBe('weather_agent');
            expect(weatherRoot!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();
            expect(weatherRoot!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(weatherRoot!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(45);
            expect(weatherRoot!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(70);

            const weatherSteps = container.items.filter(
              span => span.name.startsWith('step ') && span.parent_span_id === weatherRoot!.span_id,
            );
            expect(weatherSteps).toHaveLength(2);

            const firstStep = weatherSteps.find(span => span.name === 'step 0');
            const secondStep = weatherSteps.find(span => span.name === 'step 1');
            expect(firstStep).toBeDefined();
            expect(secondStep).toBeDefined();

            const firstModelCall = container.items.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                span.parent_span_id === firstStep!.span_id &&
                span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value === 10,
            );
            expect(firstModelCall).toBeDefined();
            expect(firstModelCall!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(firstModelCall!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeUndefined();

            const toolSpan = container.items.find(
              span => span.name === 'execute_tool getWeather' && span.parent_span_id === firstStep!.span_id,
            );
            expect(toolSpan).toBeDefined();
            expect(toolSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
            expect(toolSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
            expect(toolSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
            expect(toolSpan!.attributes[GEN_AI_TOOL_INPUT_ATTRIBUTE]).toBeUndefined();

            const secondModelCall = container.items.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                span.parent_span_id === secondStep!.span_id &&
                span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value === 15,
            );
            expect(secondModelCall).toBeDefined();

            const streamRoot = container.items.find(span => span.name === 'invoke_agent stream_agent');
            expect(streamRoot).toBeDefined();
            expect(streamRoot!.attributes[GEN_AI_FUNCTION_ID_ATTRIBUTE].value).toBe('stream_agent');
            expect(streamRoot!.attributes['gen_ai.response.streaming'].value).toBe(true);

            const streamStep = container.items.find(
              span => span.name === 'step 0' && span.parent_span_id === streamRoot!.span_id,
            );
            expect(streamStep).toBeDefined();

            const streamModelCall = container.items.find(
              span => span.name === 'generate_content mock-model-id' && span.parent_span_id === streamStep!.span_id,
            );
            expect(streamModelCall).toBeDefined();

            const embeddingSpan = container.items.find(span => span.name === 'embeddings mock-model-id');
            expect(embeddingSpan).toBeDefined();
            expect(embeddingSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(embeddingSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe('embed this text');
            expect(embeddingSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(7);

            const rerankSpan = container.items.find(span => span.name === 'rerank mock-model-id');
            expect(rerankSpan).toBeDefined();
            expect(rerankSpan!.attributes['sentry.op'].value).toBe('gen_ai.rerank');
            expect(rerankSpan!.attributes[GEN_AI_FUNCTION_ID_ATTRIBUTE].value).toBe('reranker');

            expect(
              container.items.some(span => span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value === 'disabled'),
            ).toBe(false);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records inputs and outputs when genAI data collection is enabled', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(11);

            const weatherRoot = container.items.find(span => span.name === 'invoke_agent weather_agent');
            expect(weatherRoot).toBeDefined();
            expect(weatherRoot!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'What is the weather in San Francisco?',
            );
            expect(weatherRoot!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'The weather in San Francisco is sunny.',
            );

            const firstStep = container.items.find(
              span => span.name === 'step 0' && span.parent_span_id === weatherRoot!.span_id,
            );
            expect(firstStep).toBeDefined();

            const firstModelCall = container.items.find(
              span => span.name === 'generate_content mock-model-id' && span.parent_span_id === firstStep!.span_id,
            );
            expect(firstModelCall).toBeDefined();
            expect(firstModelCall!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toContain('getWeather');

            const toolSpan = container.items.find(
              span => span.name === 'execute_tool getWeather' && span.parent_span_id === firstStep!.span_id,
            );
            expect(toolSpan).toBeDefined();
            expect(toolSpan!.attributes[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE].value).toBe(
              'Get the current weather for a location',
            );
            expect(toolSpan!.attributes[GEN_AI_TOOL_INPUT_ATTRIBUTE].value).toContain('San Francisco');
            expect(toolSpan!.attributes[GEN_AI_TOOL_OUTPUT_ATTRIBUTE].value).toContain('Sunny');

            const modelCallWithText = container.items.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value?.includes(
                  'The weather in San Francisco is sunny.',
                ),
            );
            expect(modelCallWithText).toBeDefined();
            expect(modelCallWithText!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures tool errors from tracing-channel tool spans', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);

            const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather');
            expect(toolSpan).toBeDefined();
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
                  type: 'Error',
                  value: 'Error in tool',
                }),
              ]),
            );
            expect(event.tags).toEqual(
              expect.objectContaining({
                'vercel.ai.tool.name': 'getWeather',
                'vercel.ai.tool.callId': 'call-1',
              }),
            );
          },
        })
        .start()
        .completed();
    });
  });
});
