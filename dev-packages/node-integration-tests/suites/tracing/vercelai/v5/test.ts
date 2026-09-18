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
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { getStringAttributeValue } from '../../../../utils';

const expectedOrigin = 'auto.vercelai.channel';

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
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes['vercel.ai.operationId'].value === 'ai.generateText' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS].value === 10,
              );
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan!.status).toBe('ok');
              expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes['sentry.origin'].value).toBe(expectedOrigin);
              expect(firstInvokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(20);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(30);
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId'].value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS].value === 10,
              );
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan!.status).toBe('ok');
              expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes['vercel.ai.operationId'].value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('mock-provider');
              expect(firstGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
              expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan!.status).toBe('ok');
              expect(secondInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              );

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes(
                    'Second span here!',
                  ),
              );
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan!.status).toBe('ok');
              expect(secondGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span => span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
              );
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan!.status).toBe('ok');

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
              );
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan!.status).toBe('ok');

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan!.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan!.status).toBe('ok');
              expect(toolExecutionSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan!.attributes['sentry.origin'].value).toBe(expectedOrigin);
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
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan!.status).toBe('ok');
              expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
                '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes('First span here!'),
              );
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan!.status).toBe('ok');
              expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan!.attributes['vercel.ai.operationId'].value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
              expect(firstGenerateContentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('First span here!');

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan!.status).toBe('ok');
              expect(secondInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(secondInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes(
                    'Second span here!',
                  ),
              );
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan!.status).toBe('ok');
              expect(secondGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                    '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan!.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan!.status).toBe('ok');
              expect(toolInvokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toBe(
                '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_TOOL_DEFINITIONS] !== undefined,
              );
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan!.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan!.status).toBe('ok');
              expect(toolGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(toolGenerateContentSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toBeDefined();
              expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather');
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan!.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan!.status).toBe('ok');
              expect(toolExecutionSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
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
        let transactionEvent: Event | undefined;
        let errorEvent: Event | undefined;

        await createRunner()
          // The tool error is captured while the tool is running (mid-transaction), so the error event
          // and the transaction/span envelopes can arrive in either order — assert content, not wire order.
          .unordered()
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
              expect(toolSpan!.attributes['sentry.origin'].value).toBe(expectedOrigin);
              expect(toolSpan!.attributes[GEN_AI_TOOL_NAME].value).toBe('getWeather');
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
        ai: '5.0.30',
      },
    },
  );
});
