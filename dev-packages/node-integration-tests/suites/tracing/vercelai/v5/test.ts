import type { SerializedStreamedSpanContainer } from '@sentry/core';
import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { getStringAttributeValue } from '../../../../utils';

describe('Vercel AI integration (v5)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
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
                  span.attributes['vercel.ai.operationId'].value === 'ai.generateText' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS].value === 10,
              );
              expect(firstInvokeAgentSpan!.status).toBe('ok');
              expect(firstInvokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(20);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(30);

              const firstGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId'].value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS].value === 10,
              );
              expect(firstGenerateContentSpan!.status).toBe('ok');
              expect(firstGenerateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('mock-provider');

              const secondInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan!.status).toBe('ok');
              expect(secondInvokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              );

              const secondGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes(
                    'Second span here!',
                  ),
              );
              expect(secondGenerateContentSpan!.status).toBe('ok');
              expect(secondGenerateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = spans.find(
                span => span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
              );
              expect(toolInvokeAgentSpan!.status).toBe('ok');

              const toolGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
              );
              expect(toolGenerateContentSpan!.status).toBe('ok');

              const toolExecutionSpan = spans.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan!.status).toBe('ok');
              expect(toolExecutionSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_NAME].value).toBe('getWeather');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );

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
              );
              expect(firstInvokeAgentSpan!.status).toBe('ok');
              expect(firstInvokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              const firstGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes('First span here!'),
              );
              expect(firstGenerateContentSpan!.status).toBe('ok');
              expect(firstGenerateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes['vercel.ai.operationId'].value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
              expect(firstGenerateContentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('First span here!');

              const secondInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan!.status).toBe('ok');
              expect(secondInvokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');

              const secondGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes(
                    'Second span here!',
                  ),
              );
              expect(secondGenerateContentSpan!.status).toBe('ok');
              expect(secondGenerateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = spans.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );
              expect(toolInvokeAgentSpan!.status).toBe('ok');

              const toolGenerateContentSpan = spans.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_TOOL_DEFINITIONS] !== undefined,
              );
              expect(toolGenerateContentSpan!.status).toBe('ok');
              expect(toolGenerateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');
              expect(toolGenerateContentSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toBeDefined();
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);

              const toolExecutionSpan = spans.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan!.status).toBe('ok');
              expect(toolExecutionSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_NAME].value).toBe('getWeather');
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_DESCRIPTION].value).toBe(
                'Get the current weather for a location',
              );
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_ARGUMENTS]).toBeDefined();
              expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_RESULT]).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error-in-tool.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures error in tool', async () => {
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];
        let errorEvent: Event | undefined;

        await createRunner()
          // The tool error is captured while the tool is running (mid-transaction), so the error event
          // and the span containers can arrive in either order — assert content, not wire order.
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

        const segment = receivedSpans.find(span => span.is_segment && span.name === 'main');
        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel');
        expect(spans).toHaveLength(3);
        const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent');
        expect(invokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');

        const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
        expect(generateContentSpan!.status).toBe('ok');
        expect(generateContentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.generate_content');

        const toolSpan = spans.find(span => span.name === 'execute_tool getWeather');
        expect(toolSpan!.status).toBe('error');
        expect(toolSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.execute_tool');
        expect(toolSpan!.attributes[GEN_AI_TOOL_NAME].value).toBe('getWeather');

        expect(errorEvent!.level).toBe('error');
        expect(errorEvent!.tags).toEqual({
          'vercel.ai.tool.name': 'getWeather',
          'vercel.ai.tool.callId': 'call-1',
        });

        // Trace id should be the same for the segment and error event
        expect(segment!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );
});
