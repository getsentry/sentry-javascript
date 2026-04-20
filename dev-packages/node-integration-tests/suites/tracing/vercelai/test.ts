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

            // [3] Second generateText — generate_content (doGenerate with telemetry)
            expect(fourthSpan!.name).toBe('generate_content mock-model-id');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(fourthSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE].value).toContain('Second span here!');

            // [4] Third generateText — invoke_agent (tool call)
            expect(fifthSpan!.name).toBe('invoke_agent');
            expect(fifthSpan!.status).toBe('ok');
            expect(fifthSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(fifthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(fifthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(fifthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(40);

            // [5] Third generateText — generate_content (doGenerate with tools)
            expect(sixthSpan!.name).toBe('generate_content mock-model-id');
            expect(sixthSpan!.status).toBe('ok');
            expect(sixthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(sixthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(15);

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
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
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
            expect(fifthSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(fifthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
              '[{"role":"user","content":"What is the weather in San Francisco?"}]',
            );
            expect(fifthSpan!.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]).toBeDefined();

            // [5] Third doGenerate with available tools
            expect(sixthSpan!.name).toBe('generate_content mock-model-id');
            expect(sixthSpan!.status).toBe('ok');
            expect(sixthSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(sixthSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toContain('getWeather');
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] invoke_agent (errored due to tool error)
            expect(firstSpan!.name).toBe('invoke_agent');
            expect(firstSpan!.status).toBe('error');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');

            // [1] generate_content (doGenerate, succeeded)
            expect(secondSpan!.name).toBe('generate_content mock-model-id');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText.doGenerate');

            // [2] execute_tool (errored)
            expect(thirdSpan!.name).toBe('execute_tool getWeather');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
            expect(thirdSpan!.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE].value).toBe('getWeather');
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] invoke_agent (errored)
            expect(firstSpan!.name).toBe('invoke_agent');
            expect(firstSpan!.status).toBe('error');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateText');

            // [1] generate_content (doGenerate, succeeded)
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
            const [firstSpan, secondSpan] = container.items;

            // [0] invoke_agent
            expect(firstSpan!.name).toBe('invoke_agent');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.vercelai.otel');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('invoke_agent');

            // [1] generate_content (doGenerate)
            expect(secondSpan!.name).toBe('generateText.doGenerate');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.vercelai.otel');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('generate_content');
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
              const [firstSpan, secondSpan] = container.items;

              // [0] invoke_agent (carries system instructions)
              expect(firstSpan!.name).toBe('invoke_agent');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );

              // [1] generate_content
              expect(secondSpan!.name).toBe('generate_content mock-model-id');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
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
              const [firstSpan, , thirdSpan] = container.items;

              // [0] First call — invoke_agent: last message truncated (only C's remain, D's cropped)
              expect(firstSpan!.name).toBe('invoke_agent');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[.*"(?:text|content)":"C+".*\]$/,
              );

              // [2] Second call — invoke_agent: last message is small and kept intact
              expect(thirdSpan!.name).toBe('invoke_agent');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
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
            const [firstSpan, secondSpan] = container.items;

            // [0] embed doEmbed
            expect(firstSpan!.name).toBe('embeddings mock-model-id');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('mock-model-id');
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);

            // [1] embedMany doEmbed
            expect(secondSpan!.name).toBe('embeddings mock-model-id');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(20);
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
            const [firstSpan, secondSpan] = container.items;

            // [0] embed doEmbed with input
            expect(firstSpan!.name).toBe('embeddings mock-model-id');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(firstSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe('Embedding test!');

            // [1] embedMany doEmbed with input
            expect(secondSpan!.name).toBe('embeddings mock-model-id');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.embeddings');
            expect(secondSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe(
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
            const [firstSpan, secondSpan] = container.items;

            // [0] invoke_agent with user-set conversation id
            expect(firstSpan!.name).toBe('invoke_agent');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstSpan!.attributes['gen_ai.conversation.id'].value).toBe('conv-a');

            // [1] generate_content also inherits the conversation id
            expect(secondSpan!.name).toBe('generate_content mock-model-id');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondSpan!.attributes['gen_ai.conversation.id'].value).toBe('conv-a');
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
              const [firstSpan, secondSpan] = container.items;

              // [0] invoke_agent — input messages preserved in full (no truncation)
              expect(firstSpan!.name).toBe('invoke_agent');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([
                  { role: 'user', content: longContent },
                  { role: 'assistant', content: 'Some reply' },
                  { role: 'user', content: 'Follow-up question' },
                ]),
              );
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);

              // [1] generate_content
              expect(secondSpan!.name).toBe('generate_content mock-model-id');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            },
          })
          .start()
          .completed();
      });
    },
  );

  const streamingLongContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(__dirname, 'scenario-span-streaming.mjs', 'instrument-streaming.mjs', (createRunner, test) => {
    test('automatically disables truncation when span streaming is enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] generate_content — in streaming mode, doGenerate ends first
            expect(firstSpan!.name).toBe('generate_content mock-model-id');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

            // [1] invoke_agent — carries the full (untruncated) input messages
            expect(secondSpan!.name).toBe('invoke_agent');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(streamingLongContent);

            // [2] main — root span (streamed alongside)
            expect(thirdSpan!.name).toBe('main');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('function');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-span-streaming.mjs',
    'instrument-streaming-with-truncation.mjs',
    (createRunner, test) => {
      test('respects explicit enableTruncation: true even when span streaming is enabled', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items).toHaveLength(3);
              const [firstSpan, secondSpan, thirdSpan] = container.items;

              // [0] generate_content — in streaming mode, doGenerate ends first
              expect(firstSpan!.name).toBe('generate_content mock-model-id');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');

              // [1] invoke_agent — content truncated despite streaming (explicit enableTruncation: true)
              expect(secondSpan!.name).toBe('invoke_agent');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"AAAA/,
              );
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );

              // [2] main — root span
              expect(thirdSpan!.name).toBe('main');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('function');
            },
          })
          .start()
          .completed();
      });
    },
  );
});
