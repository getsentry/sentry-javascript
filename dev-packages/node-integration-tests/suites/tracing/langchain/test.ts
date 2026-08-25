import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import {
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE,
} from '../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';
import { createEsmTests } from '../../../utils/runner/createEsmAndCjsTests';

describe('LangChain integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates langchain related spans with genAI recording disabled', async () => {
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
            expect(sonnetSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
            expect(sonnetSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_ID]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();

            const opusSpan = container.items.find(span => span.name === 'chat claude-3-opus-20240229');
            expect(opusSpan).toBeDefined();
            expect(opusSpan!.status).toBe('ok');
            expect(opusSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(opusSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(opusSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-opus-20240229');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.9);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.95);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(200);
            expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(errorSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
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
    test('creates langchain related spans with genAI recording enabled', async () => {
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
            expect(sonnetSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
            expect(sonnetSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_ID]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_MODEL]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE]).toBeDefined();
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(sonnetSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

            const opusSpan = container.items.find(span => span.name === 'chat claude-3-opus-20240229');
            expect(opusSpan).toBeDefined();
            expect(opusSpan!.status).toBe('ok');
            expect(opusSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-opus-20240229');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.9);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.95);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(200);
            expect(opusSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
            expect(opusSpan!.attributes[GEN_AI_RESPONSE_TEXT]).toBeDefined();
            expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

            const errorSpan = container.items.find(span => span.name === 'chat error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
            expect(errorSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
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
            expect(firstSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
            expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
            expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(150);
            expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(20);
            expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(30);
            expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(50);
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('tool_use');
            expect(firstSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS]).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-openai-before-langchain.mjs', 'instrument.mjs', (createRunner, test) => {
    test('demonstrates timing issue with duplicate spans', async () => {
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
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-direct-after-langchain-express.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('keeps instrumenting direct provider calls in requests after a LangChain request', async () => {
        const runner = createRunner()
          // The transaction and span envelopes of a request can arrive in either order.
          .unordered()
          .expect({ transaction: { transaction: 'GET /langchain' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              expect(container.items[0]!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(container.items[0]!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            },
          })
          .expect({ transaction: { transaction: 'GET /direct' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(1);
              expect(container.items[0]!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(container.items[0]!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');
            },
          })
          .start();

        // The LangChain request marks Anthropic as skipped for its own invocation only; the direct
        // call of the next request must still get its span.
        await runner.makeRequest('get', '/langchain');
        await runner.makeRequest('get', '/direct');
        await runner.completed();
      });
    },
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
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(
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
    test('creates embedding spans with genAI recording disabled', async () => {
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
              expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
              expect(span.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(span.attributes[GEN_AI_REQUEST_MODEL].value).toBe('text-embedding-3-small');
              expect(span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);
            }

            const errorSpan = container.items.find(span => span.name === 'embeddings error-model');
            expect(errorSpan).toBeDefined();
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes['sentry.op'].value).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
            expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
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
    test('creates embedding spans with genAI recording enabled', async () => {
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
              span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'Hello world',
            );
            expect(querySpan).toBeDefined();
            expect(querySpan!.name).toBe('embeddings text-embedding-3-small');
            expect(querySpan!.status).toBe('ok');
            expect(querySpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);

            const documentsSpan = container.items.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value ===
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

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-span-streaming.mjs', (createRunner, test) => {
    test('creates langchain related spans with span streaming enabled', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          span: container => {
            const sonnetSpan = container.items.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(sonnetSpan).toBeDefined();
            expect(sonnetSpan!.status).toBe('ok');
            expect(sonnetSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
            expect(sonnetSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
            expect(sonnetSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(sonnetSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.attributes[GEN_AI_INPUT_MESSAGES]).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });
});
