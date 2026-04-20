import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
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

describe('Vercel AI integration (V5)', () => {
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
              const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan, seventhSpan] = container.items;

              // [0] First generateText — invoke_agent (no explicit telemetry, no PII)
              expect(firstSpan!.name).toBe('invoke_agent');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
              expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(20);
              expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(30);
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              // [1] First generateText — generate_content (doGenerate, no PII)
              expect(secondSpan!.name).toBe('generate_content mock-model-id');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(secondSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText.doGenerate');
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('mock-provider');
              expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              // [2] Second generateText — invoke_agent (explicit telemetry enabled)
              expect(thirdSpan!.name).toBe('invoke_agent');
              expect(thirdSpan!.status).toBe('ok');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(thirdSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              );

              // [3] Second generateText — generate_content (doGenerate with PII)
              expect(fourthSpan!.name).toBe('generate_content mock-model-id');
              expect(fourthSpan!.status).toBe('ok');
              expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              // [4] Third generateText — invoke_agent (with tool call, no PII)
              expect(fifthSpan!.name).toBe('invoke_agent');
              expect(fifthSpan!.status).toBe('ok');

              // [5] Third generateText — generate_content (doGenerate)
              expect(sixthSpan!.name).toBe('generate_content mock-model-id');
              expect(sixthSpan!.status).toBe('ok');

              // [6] Tool execution
              expect(seventhSpan!.name).toBe('execute_tool getWeather');
              expect(seventhSpan!.status).toBe('ok');
              expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(seventhSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
              expect(seventhSpan!.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE].value).toBe('call-1');
              expect(seventhSpan!.attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE].value).toBe('function');
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
      test('creates ai related spans with sendDefaultPii: true', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan, seventhSpan] = container.items;

              // [0] First generateText — invoke_agent (PII auto-enabled)
              expect(firstSpan!.name).toBe('invoke_agent');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              // [1] First doGenerate with PII
              expect(secondSpan!.name).toBe('generate_content mock-model-id');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(secondSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText.doGenerate');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
              expect(secondSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toContain('First span here!');

              // [2] Second generateText — invoke_agent (explicit telemetry)
              expect(thirdSpan!.name).toBe('invoke_agent');
              expect(thirdSpan!.status).toBe('ok');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );

              // [3] Second doGenerate
              expect(fourthSpan!.name).toBe('generate_content mock-model-id');
              expect(fourthSpan!.status).toBe('ok');
              expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              // [4] Third generateText — invoke_agent (tool call prompt)
              expect(fifthSpan!.name).toBe('invoke_agent');
              expect(fifthSpan!.status).toBe('ok');
              expect(fifthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );

              // [5] Third doGenerate with available tools
              expect(sixthSpan!.name).toBe('generate_content mock-model-id');
              expect(sixthSpan!.status).toBe('ok');
              expect(sixthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(sixthSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeDefined();
              expect(sixthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);

              // [6] Tool execution with PII
              expect(seventhSpan!.name).toBe('execute_tool getWeather');
              expect(seventhSpan!.status).toBe('ok');
              expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(seventhSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
              expect(seventhSpan!.attributes[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE].value).toBe(
                'Get the current weather for a location',
              );
              expect(seventhSpan!.attributes[GEN_AI_TOOL_INPUT_ATTRIBUTE]).toBeDefined();
              expect(seventhSpan!.attributes[GEN_AI_TOOL_OUTPUT_ATTRIBUTE]).toBeDefined();
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
          .expect({
            transaction: transaction => {
              transactionEvent = transaction;
            },
          })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(3);
              const [firstSpan, secondSpan, thirdSpan] = container.items;

              // [0] invoke_agent
              expect(firstSpan!.name).toBe('invoke_agent');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

              // [1] generate_content (doGenerate)
              expect(secondSpan!.name).toBe('generate_content mock-model-id');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              // [2] execute_tool (errored)
              expect(thirdSpan!.name).toBe('execute_tool getWeather');
              expect(thirdSpan!.status).toBe('error');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(thirdSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
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

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans with v5', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(7);
              const [firstSpan, secondSpan, , , fifthSpan, sixthSpan, seventhSpan] = container.items;

              // invoke_agent spans at [0], [2], [4]
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(fifthSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

              // generate_content spans at [1], [3], [5]
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
              expect(sixthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              // execute_tool at [6]
              expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
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
});
