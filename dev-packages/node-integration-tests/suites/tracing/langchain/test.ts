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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat claude-3-5-sonnet-20241022',
              'chat claude-3-opus-20240229',
              'chat error-model',
            ]);

            const sonnetSpan = container.items.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(sonnetSpan).toBeDefined();
            expect(sonnetSpan!.status).toBe('ok');
            expect(sonnetSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(sonnetSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(sonnetSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
            expect(sonnetSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();

            const opusSpan = container.items.find(span => span.name === 'chat claude-3-opus-20240229');
            expect(opusSpan).toBeDefined();
            expect(opusSpan!.status).toBe('ok');
            expect(opusSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(opusSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(opusSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-opus-20240229');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.9);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.95);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(200);
            expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(errorSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(errorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
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
            for (const span of container.items) {
              expect(span.attributes['sentry.op'].value).toBe('gen_ai.chat');
            }
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chat claude-3-5-sonnet-20241022',
              'chat claude-3-opus-20240229',
              'chat error-model',
            ]);

            const sonnetSpan = container.items.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(sonnetSpan).toBeDefined();
            expect(sonnetSpan!.status).toBe('ok');
            expect(sonnetSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(sonnetSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(sonnetSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
            expect(sonnetSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            const opusSpan = container.items.find(span => span.name === 'chat claude-3-opus-20240229');
            expect(opusSpan).toBeDefined();
            expect(opusSpan!.status).toBe('ok');
            expect(opusSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('claude-3-opus-20240229');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.9);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE].value).toBe(0.95);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(200);
            expect(opusSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
            expect(opusSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE]).toBeDefined();
            expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(10);
            expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(25);

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('anthropic');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
            expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
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
              const stringInputSpan = container.items.find(
                span => span.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]?.value === 1,
              );
              expect(stringInputSpan).toBeDefined();
              expect(stringInputSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(stringInputSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toMatch(
                /^\[\{"role":"user","content":"C+"\}\]$/,
              );

              const arrayInputSpan = container.items.find(
                span =>
                  span.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]?.value === 2 &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.match(
                    /^\[\{"role":"user","content":"C+"\}\]$/,
                  ),
              );
              expect(arrayInputSpan).toBeDefined();
              expect(arrayInputSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(arrayInputSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBeDefined();

              const smallMessageSpan = container.items.find(
                span =>
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                  JSON.stringify([{ role: 'user', content: 'This is a small message that fits within the limit' }]),
              );
              expect(smallMessageSpan).toBeDefined();
              expect(smallMessageSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(smallMessageSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(2);
              expect(smallMessageSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]).toBeDefined();
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
              const anthropicSpan = container.items.find(
                span => span.attributes['sentry.origin'].value === 'auto.ai.anthropic',
              );
              expect(anthropicSpan).toBeDefined();
              expect(anthropicSpan!.name).toBe('chat claude-3-5-sonnet-20241022');

              // LangChain call is instrumented by LangChain.
              const langchainSpan = container.items.find(
                span => span.attributes['sentry.origin'].value === 'auto.ai.langchain',
              );
              expect(langchainSpan).toBeDefined();
              expect(langchainSpan!.name).toBe('chat claude-3-5-sonnet-20241022');

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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'chain format_prompt',
              'chain parse_output',
              'chain unknown_chain',
              'chat claude-3-5-sonnet-20241022',
            ]);

            const formatPromptSpan = container.items.find(span => span.name === 'chain format_prompt');
            expect(formatPromptSpan).toBeDefined();
            expect(formatPromptSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(formatPromptSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(formatPromptSpan!.attributes['langchain.chain.name'].value).toBe('format_prompt');

            const chatSpan = container.items.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(chatSpan).toBeDefined();
            expect(chatSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');

            const parseOutputSpan = container.items.find(span => span.name === 'chain parse_output');
            expect(parseOutputSpan).toBeDefined();
            expect(parseOutputSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(parseOutputSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(parseOutputSpan!.attributes['langchain.chain.name'].value).toBe('parse_output');

            const unknownChainSpan = container.items.find(span => span.name === 'chain unknown_chain');
            expect(unknownChainSpan).toBeDefined();
            expect(unknownChainSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-3-small',
              'embeddings text-embedding-3-small',
            ]);

            const successfulSpans = container.items.filter(
              span => span.name === 'embeddings text-embedding-3-small' && span.status === 'ok',
            );
            expect(successfulSpans).toHaveLength(2);
            for (const span of successfulSpans) {
              expect(span.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
              expect(span.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(span.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('embeddings');
              expect(span.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
              expect(span.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('text-embedding-3-small');
              expect(span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);
            }

            const errorSpan = container.items.find(span => span.name === 'embeddings error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
            expect(errorSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
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
            for (const span of container.items) {
              expect(span.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
            }
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
            expect(container.items.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-3-small',
              'embeddings text-embedding-3-small',
            ]);

            const querySpan = container.items.find(
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'Hello world',
            );
            expect(querySpan).toBeDefined();
            expect(querySpan!.name).toBe('embeddings text-embedding-3-small');
            expect(querySpan!.status).toBe('ok');
            expect(querySpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);

            const documentsSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value ===
                JSON.stringify(['First document', 'Second document']),
            );
            expect(documentsSpan).toBeDefined();
            expect(documentsSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(documentsSpan!.status).toBe('ok');

            const errorSpan = container.items.find(span => span.name === 'embeddings error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
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
            const spans = container.items;

            const chatSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(streamingLongContent),
            );
            expect(chatSpan).toBeDefined();
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
              const spans = container.items;

              // With explicit enableTruncation: true, content should be truncated despite streaming.
              const chatSpan = spans.find(s =>
                s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith('[{"role":"user","content":"AAAA'),
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );
            },
          })
          .start()
          .completed();
      });
    },
  );
});
