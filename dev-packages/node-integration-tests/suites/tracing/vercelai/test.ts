import type { SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';
import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_ORIGIN,
  GEN_AI_OPERATION_NAME,
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';
import { getStringAttributeValue } from '../../../utils';

const expectedOrigin = 'auto.vercelai.channel';
const toolCallArgs = '{\\"location\\":\\"San Francisco\\"}';

describe('Vercel AI integration (v4)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
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
            expect(firstInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(firstInvokeAgentSpan!.status).toBe('ok');
            expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
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
            expect(firstGenerateContentSpan!.status).toBe('ok');
            expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(firstGenerateContentSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('mock-provider');

            const secondInvokeAgentSpan = spans.find(
              span =>
                span.name === 'invoke_agent' &&
                span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                  '[{"role":"user","content":"Where is the second span?"}]',
            );
            expect(secondInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 30,
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 20,
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'mock-model-id',
            });
            expect(secondInvokeAgentSpan!.status).toBe('ok');
            expect(secondInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
              '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
            );

            const secondGenerateContentSpan = spans.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes('Second span here!'),
            );
            expect(secondGenerateContentSpan!.status).toBe('ok');
            expect(secondGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(secondGenerateContentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('Second span here!');

            const toolInvokeAgentSpan = spans.find(
              span => span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
            );
            expect(toolInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'mock-model-id',
            });
            expect(toolInvokeAgentSpan!.status).toBe('ok');
            expect(toolInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(25);
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(40);

            const toolGenerateContentSpan = spans.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 15,
            );
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
            expect(toolGenerateContentSpan!.status).toBe('ok');
            expect(toolGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

            const toolExecutionSpan = spans.find(span => span.name === 'execute_tool getWeather');
            expect(toolExecutionSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(toolExecutionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'execute_tool',
            });
            expect(toolExecutionSpan!.status).toBe('ok');
            expect(toolExecutionSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
            expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_NAME].value).toBe('getWeather');
            expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
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
            expect(firstInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ type: 'integer', value: 30 });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 20,
            });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ type: 'integer', value: 10 });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toEqual({
              type: 'string',
              value: 'mock-model-id',
            });
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'mock-model-id',
            });
            expect(firstInvokeAgentSpan!.status).toBe('ok');
            expect(firstInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstInvokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
            expect(firstInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toBe(
              '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
            );

            const firstGenerateContentSpan = spans.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes('First span here!'),
            );
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
            expect(firstGenerateContentSpan!.status).toBe('ok');
            expect(firstGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(firstGenerateContentSpan!.attributes['vercel.ai.operationId'].value).toBe(
              'ai.generateText.doGenerate',
            );
            expect(firstGenerateContentSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
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
            );
            expect(secondInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({
              type: 'integer',
              value: 30,
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 20,
            });
            expect(secondInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({
              type: 'integer',
              value: 10,
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
            expect(secondInvokeAgentSpan!.status).toBe('ok');
            expect(secondInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

            const secondGenerateContentSpan = spans.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                getStringAttributeValue(span.attributes[GEN_AI_OUTPUT_MESSAGES]?.value)?.includes('Second span here!'),
            );
            expect(secondGenerateContentSpan!.status).toBe('ok');
            expect(secondGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

            const toolInvokeAgentSpan = spans.find(
              span =>
                span.name === 'invoke_agent' &&
                span.attributes[GEN_AI_INPUT_MESSAGES]?.value ===
                  '[{"role":"user","content":"What is the weather in San Francisco?"}]',
            );
            expect(toolInvokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ type: 'integer', value: 40 });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({ type: 'integer', value: 25 });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ type: 'integer', value: 15 });
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'mock-model-id',
            });
            expect(toolInvokeAgentSpan!.status).toBe('ok');
            expect(toolInvokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolInvokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]).toEqual({
              type: 'string',
              value: `[{"role":"assistant","parts":[{"type":"text","content":"Tool call completed!"},{"type":"tool_call","id":"call-1","name":"getWeather","arguments":"${toolCallArgs}"}],"finish_reason":"tool_call"}]`,
            });

            const toolGenerateContentSpan = spans.find(
              span =>
                span.name === 'generate_content mock-model-id' &&
                getStringAttributeValue(span.attributes[GEN_AI_TOOL_DEFINITIONS]?.value)?.includes('getWeather'),
            );
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
            expect(toolGenerateContentSpan!.status).toBe('ok');
            expect(toolGenerateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(toolGenerateContentSpan!.attributes[GEN_AI_TOOL_DEFINITIONS]).toEqual({
              type: 'string',
              value: expect.stringContaining('getWeather'),
            });
            expect(toolGenerateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(15);

            const toolExecutionSpan = spans.find(span => span.name === 'execute_tool getWeather');
            expect(toolExecutionSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(toolExecutionSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'execute_tool',
            });
            expect(toolExecutionSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toEqual({
              type: 'string',
              value: 'call-1',
            });
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
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures error in tool', async () => {
      let segment: SerializedStreamedSpan | undefined;
      let errorEvent: Event | undefined;

      await createRunner()
        // In orchestrion mode the tool error is captured mid-transaction, so the error and
        // span containers can arrive in either order — assert content, not wire order.
        .unordered()
        .expect({
          span: container => {
            segment = container.items.find(span => span.is_segment);
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(3);
            const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent' && span.status === 'error');
            expect(invokeAgentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(invokeAgentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'invoke_agent',
            });
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');

            const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan!.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: expectedOrigin });
            expect(generateContentSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({
              type: 'string',
              value: 'generate_content',
            });
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toEqual({ type: 'integer', value: 40 });
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS]).toEqual({ type: 'integer', value: 25 });
            expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS]).toEqual({ type: 'integer', value: 15 });
            expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL]).toEqual({
              type: 'string',
              value: 'mock-model-id',
            });
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText.doGenerate');

            const toolSpan = spans.find(span => span.name === 'execute_tool getWeather');
            expect(toolSpan!.attributes[GEN_AI_OPERATION_NAME]).toEqual({ type: 'string', value: 'execute_tool' });
            expect(toolSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]).toEqual({ type: 'string', value: 'call-1' });
            expect(toolSpan!.status).toBe('error');
            expect(toolSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
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

      expect(segment!.name).toBe('main');

      expect(errorEvent!.tags).toMatchObject({ 'test-tag': 'test-value' });

      // The tool error bubbles out of the `ai` call as the SDK's wrapped `AI_ToolExecutionError`. The
      // channel subscriber deliberately doesn't self-capture v4 tool errors (that would double-report
      // alongside the bubbled error), so a single error event is produced in both modes.
      expect(errorEvent!.exception?.values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AI_ToolExecutionError',
            value: 'Error executing tool getWeather: Error in tool',
          }),
        ]),
      );
      // Both paths stamp the operation's call-site span onto the bubbled error, so the global
      // unhandled-rejection handler restores it and correlates the report to the transaction's root span.
      expect(errorEvent!.contexts!.trace!.trace_id).toBe(segment!.trace_id);
      expect(errorEvent!.contexts!.trace!.span_id).toBe(segment!.span_id);
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool-express.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures error in tool in express server', async () => {
      let segment: SerializedStreamedSpan | undefined;
      let spanItems: SerializedStreamedSpanContainer['items'] = [];
      let errorEvent: Event | undefined;

      const runner = createRunner()
        // The error and span containers can arrive in either order, so assert content, not order.
        .unordered()
        .expect({
          span: container => {
            spanItems = container.items;
            segment = container.items.find(span => span.is_segment);
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(3);
            const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent' && span.status === 'error');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');

            const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

            const toolSpan = spans.find(span => span.name === 'execute_tool getWeather');
            expect(toolSpan!.status).toBe('error');
            expect(toolSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
            expect(toolSpan!.attributes[GEN_AI_TOOL_NAME].value).toBe('getWeather');
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

      expect(segment!.name).toBe('GET /test/error-in-tool');

      expect(errorEvent!.tags).toMatchObject({ 'test-tag': 'test-value' });
      expect(errorEvent!.contexts!.trace!.trace_id).toBe(segment!.trace_id);

      // The tool error bubbles out of the `ai` call as the SDK's wrapped `AI_ToolExecutionError` and is
      // captured once by the express error handler — the channel subscriber deliberately doesn't
      // self-capture v4 tool errors, so orchestrion and OTel produce the same single error event.
      expect(errorEvent!.exception?.values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AI_ToolExecutionError',
            value: 'Error executing tool getWeather: Error in tool',
          }),
        ]),
      );
      // The Express error handler captures the error on a child span of the request.
      expect(spanItems.map(span => span.span_id)).toContain(errorEvent!.contexts!.trace!.span_id);
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
              );
              expect(spans).toHaveLength(2);
              const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent');
              expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );

              const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
              expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates embedding related spans with genAI recording disabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(2);
            const embedSpan = spans.find(span => span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 10);
            expect(embedSpan!.name).toBe('embeddings mock-model-id');
            expect(embedSpan!.status).toBe('ok');
            expect(embedSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(embedSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('mock-model-id');

            const embedManySpan = spans.find(span => span.attributes[GEN_AI_USAGE_INPUT_TOKENS]?.value === 20);
            expect(embedManySpan!.name).toBe('embeddings mock-model-id');
            expect(embedManySpan!.status).toBe('ok');
            expect(embedManySpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates embedding related spans with genAI recording enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(2);
            const embedSpan = spans.find(span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'Embedding test!');
            expect(embedSpan!.name).toBe('embeddings mock-model-id');
            expect(embedSpan!.status).toBe('ok');
            expect(embedSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');

            const embedManySpan = spans.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === '["First input","Second input"]',
            );
            expect(embedManySpan!.name).toBe('embeddings mock-model-id');
            expect(embedManySpan!.status).toBe('ok');
            expect(embedManySpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-conversation-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('does not overwrite conversation id set via Sentry.setConversationId with responseId from provider metadata', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(2);
            const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['gen_ai.conversation.id'].value).toBe('conv-a');

            const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['gen_ai.conversation.id'].value).toBe('conv-a');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream-text.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates ai spans for streamText (doStream)', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(2);

            const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent');
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.streamText');
            expect(invokeAgentSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('mock-model-id');
            // Aggregated over the drained stream: v4 reports `promptTokens`/`completionTokens`, which the
            // subscriber normalizes to input/output token attributes.
            expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(20);
            expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(30);
            expect(invokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('Stream response!');

            const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.streamText.doStream');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-generate-object.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('captures generateObject spans with schema attributes', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = container.items.filter(
              span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.vercelai.channel',
            );
            expect(spans).toHaveLength(2);

            // generateObject (invoke_agent)
            const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent');
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateObject');
            expect(invokeAgentSpan!.attributes['gen_ai.operation.name'].value).toBe('invoke_agent');
            expect(invokeAgentSpan!.attributes['gen_ai.response.model'].value).toBe('mock-model-id');
            expect(invokeAgentSpan!.attributes['gen_ai.usage.input_tokens'].value).toBe(15);
            expect(invokeAgentSpan!.attributes['gen_ai.usage.output_tokens'].value).toBe(25);
            expect(invokeAgentSpan!.attributes['gen_ai.usage.total_tokens'].value).toBe(40);

            // generateObject.doGenerate (generate_content)
            const generateContentSpan = spans.find(span => span.name === 'generate_content mock-model-id');
            expect(generateContentSpan!.status).toBe('ok');
            expect(generateContentSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(generateContentSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateObject.doGenerate');
            expect(generateContentSpan!.attributes['gen_ai.operation.name'].value).toBe('generate_content');
            expect(generateContentSpan!.attributes['gen_ai.provider.name'].value).toBe('mock-provider');
            expect(generateContentSpan!.attributes['gen_ai.request.model'].value).toBe('mock-model-id');
            expect(generateContentSpan!.attributes['gen_ai.response.model'].value).toBe('mock-model-id');
            expect(generateContentSpan!.attributes['gen_ai.usage.input_tokens'].value).toBe(15);
            expect(generateContentSpan!.attributes['gen_ai.usage.output_tokens'].value).toBe(25);
            expect(generateContentSpan!.attributes['gen_ai.usage.total_tokens'].value).toBe(40);
          },
        })
        .start()
        .completed();
    });
  });
});
