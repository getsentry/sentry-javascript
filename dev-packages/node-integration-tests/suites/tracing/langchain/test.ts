import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('LangChain integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates langchain related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] chat model with claude-3-5-sonnet
            expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-5-sonnet-20241022');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();

            // [1] chat model with claude-3-opus
            expect(secondSpan!.name).toBe('chat claude-3-opus-20240229');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-opus-20240229');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.9);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.95);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(200);
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            // [2] error handling
            expect(thirdSpan!.name).toBe('chat error-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(thirdSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
          },
        })
        .start()
        .completed();
    });

    test('does not create duplicate spans from double module patching', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            // The scenario makes 3 LangChain calls (2 successful + 1 error).
            // Without the dedup guard, the file-level and module-level hooks
            // both patch the same prototype, producing 6 spans instead of 3.
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] chat claude-3-5-sonnet
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            // [1] chat claude-3-opus
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');

            // [2] chat error-model
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates langchain related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] chat model with PII
            expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-5-sonnet-20241022');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            // [1] chat model with PII
            expect(secondSpan!.name).toBe('chat claude-3-opus-20240229');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-opus-20240229');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.9);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.95);
            expect(secondSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(200);
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            // [2] error handling with PII
            expect(thirdSpan!.name).toBe('chat error-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates langchain spans with tool calls', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(1);
            const [firstSpan] = container.items;

            // [0] chat with tool_use stop reason
            expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-5-sonnet-20241022');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(150);
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(20);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(30);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(50);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('tool_use');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

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
              expect(container.items).toHaveLength(3);
              const [firstSpan, secondSpan, thirdSpan] = container.items;

              // [0] String input truncated (only C's remain, D's are cropped)
              expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(1);
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"C+"\}\]$/,
              );

              // [1] Array input, last message truncated (only C's remain, D's are cropped)
              expect(secondSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(2);
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"C+"\}\]$/,
              );
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBeDefined();

              // [2] Last message is small and kept without truncation
              expect(thirdSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(2);
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([{ role: 'user', content: 'This is a small message that fits within the limit' }]),
              );
              expect(thirdSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-openai-before-langchain.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('demonstrates timing issue with duplicate spans (ESM only)', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const [firstSpan, secondSpan] = container.items;

              // Verify the edge case limitation:
              // [0] Direct Anthropic call made BEFORE LangChain import — IS instrumented
              //     by Anthropic (origin: 'auto.ai.anthropic').
              expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');

              // [1] LangChain call — IS instrumented by LangChain (origin: 'auto.ai.langchain').
              expect(secondSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');

              // Third call (not present): Direct Anthropic call made AFTER LangChain import
              // is NOT instrumented, which demonstrates the skip mechanism works for NEW
              // clients. We should only have ONE Anthropic span (the first one), not two.
            },
          })
          .start()
          .completed();
      });
    },
    // This test fails on CJS because we use dynamic imports to simulate importing LangChain after the Anthropic client is created
    { failsOnCjs: true },
  );

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
              expect(container.items).toHaveLength(1);
              const [firstSpan] = container.items;

              // [0] chat with extracted system instructions
              expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario-chain.mjs', 'instrument.mjs', (createRunner, test) => {
    test('uses runName for chain spans instead of unknown_chain', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] format_prompt chain (invoke_agent)
            expect(firstSpan!.name).toBe('chain format_prompt');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(firstSpan!.attributes['langchain.chain.name'].value).toBe('format_prompt');

            // [1] chat model invoked inside the chain
            expect(secondSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');

            // [2] parse_output chain (invoke_agent)
            expect(thirdSpan!.name).toBe('chain parse_output');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(thirdSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(thirdSpan!.attributes['langchain.chain.name'].value).toBe('parse_output');

            // [3] unknown_chain (fallback name)
            expect(fourthSpan!.name).toBe('chain unknown_chain');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
          },
        })
        .start()
        .completed();
    });
  });

  // =========================================================================
  // Embeddings tests
  // =========================================================================

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates embedding spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] embedQuery span
            expect(firstSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');
            expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('text-embedding-3-small');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);

            // [1] embedDocuments span
            expect(secondSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);

            // [2] Error span
            expect(thirdSpan!.name).toBe('embeddings error-model');
            expect(thirdSpan!.status).toBe('error');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
            expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
          },
        })
        .start()
        .completed();
    });

    test('does not create duplicate embedding spans from double module patching', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            // The scenario makes 3 embedding calls (2 successful + 1 error).
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] embedQuery
            expect(firstSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);

            // [1] embedDocuments
            expect(secondSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);

            // [2] error embedding call
            expect(thirdSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates embedding spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] embedQuery span with input recorded
            expect(firstSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe('Hello world');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);

            // [1] embedDocuments span with input recorded
            expect(secondSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE].value).toBe(
              JSON.stringify(['First document', 'Second document']),
            );

            // [2] error embedding span (input still recorded with PII)
            expect(thirdSpan!.name).toBe('embeddings error-model');
            expect(thirdSpan!.status).toBe('error');
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
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              const [firstSpan] = container.items;

              // [0] chat with full (untruncated) input messages
              expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([
                  { role: 'user', content: longContent },
                  { role: 'assistant', content: 'Some reply' },
                  { role: 'user', content: 'Follow-up question' },
                ]),
              );
              expect(firstSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
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
            expect(container.items).toHaveLength(8);
            const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan, seventhSpan, eighthSpan] =
              container.items;

            // [0] express middleware — query
            expect(firstSpan!.name).toBe('query');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('middleware.express');

            // [1] express middleware — expressInit
            expect(secondSpan!.name).toBe('expressInit');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('middleware.express');

            // [2] express middleware — jsonParser
            expect(thirdSpan!.name).toBe('jsonParser');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('middleware.express');

            // [3] express route handler — /v1/messages
            expect(fourthSpan!.name).toBe('/v1/messages');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('request_handler.express');

            // [4] express http.server — POST /v1/messages
            expect(fifthSpan!.name).toBe('POST /v1/messages');
            expect(fifthSpan!.attributes['sentry.op'].value).toBe('http.server');

            // [5] outbound HTTP client — POST
            expect(sixthSpan!.name).toBe('POST');

            // [6] LangChain chat span — carries the full (untruncated) input messages
            expect(seventhSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
            expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(streamingLongContent);

            // [7] main — root span (streamed alongside)
            expect(eighthSpan!.name).toBe('main');
            expect(eighthSpan!.attributes['sentry.op'].value).toBe('function');
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
              expect(container.items).toHaveLength(8);
              const [firstSpan, secondSpan, thirdSpan, fourthSpan, fifthSpan, sixthSpan, seventhSpan, eighthSpan] =
                container.items;

              // [0] express middleware — query
              expect(firstSpan!.name).toBe('query');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('middleware.express');

              // [1] express middleware — expressInit
              expect(secondSpan!.name).toBe('expressInit');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('middleware.express');

              // [2] express middleware — jsonParser
              expect(thirdSpan!.name).toBe('jsonParser');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('middleware.express');

              // [3] express route handler — /v1/messages
              expect(fourthSpan!.name).toBe('/v1/messages');
              expect(fourthSpan!.attributes['sentry.op'].value).toBe('request_handler.express');

              // [4] express http.server — POST /v1/messages
              expect(fifthSpan!.name).toBe('POST /v1/messages');
              expect(fifthSpan!.attributes['sentry.op'].value).toBe('http.server');

              // [5] outbound HTTP client — POST
              expect(sixthSpan!.name).toBe('POST');

              // [6] LangChain chat span — content truncated despite streaming
              //     (explicit enableTruncation: true).
              expect(seventhSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(seventhSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"AAAA/,
              );
              expect(seventhSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );

              // [7] main — root span
              expect(eighthSpan!.name).toBe('main');
              expect(eighthSpan!.attributes['sentry.op'].value).toBe('function');
            },
          })
          .start()
          .completed();
      });
    },
  );
});
