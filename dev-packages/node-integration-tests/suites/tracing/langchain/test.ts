import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
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
  LANGCHAIN_CHAIN_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EMBEDDINGS } from '@sentry/conventions/op';
import {
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
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'chat claude-3-5-sonnet-20241022',
              'chat claude-3-opus-20240229',
              'chat error-model',
            ]);

            const sonnetSpan = spans.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.status).toBe('ok');
            expect(sonnetSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(sonnetSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
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

            const opusSpan = spans.find(span => span.name === 'chat claude-3-opus-20240229');
            expect(opusSpan!.status).toBe('ok');
            expect(opusSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(opusSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
            expect(opusSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('claude-3-opus-20240229');
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.9);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_TOP_P].value).toBe(0.95);
            expect(opusSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(200);
            expect(opusSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(10);
            expect(opusSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(opusSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(25);

            const errorSpan = spans.find(span => span.name === 'chat error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(errorSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
            expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('anthropic');
            expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates langchain related spans with genAI recording enabled', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'chat claude-3-5-sonnet-20241022',
              'chat claude-3-opus-20240229',
              'chat error-model',
            ]);

            const sonnetSpan = spans.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(sonnetSpan!.status).toBe('ok');
            expect(sonnetSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(sonnetSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
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

            const opusSpan = spans.find(span => span.name === 'chat claude-3-opus-20240229');
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

            const errorSpan = spans.find(span => span.name === 'chat error-model');
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
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
            expect(spans).toHaveLength(1);
            const [firstSpan] = spans;

            // [0] chat with tool_use stop reason
            expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(firstSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
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
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(
              span =>
                span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain' ||
                span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.anthropic',
            );
            expect(spans).toHaveLength(2);
            const anthropicSpan = spans.find(span => span.attributes[SENTRY_ORIGIN].value === 'auto.ai.anthropic');
            expect(anthropicSpan!.name).toBe('chat claude-3-5-sonnet-20241022');

            // LangChain call is instrumented by LangChain.
            const langchainSpan = spans.find(span => span.attributes[SENTRY_ORIGIN].value === 'auto.ai.langchain');
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
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
              expect(spans).toHaveLength(1);
              const [firstSpan] = spans;

              // [0] chat with extracted system instructions
              expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(firstSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
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
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
            expect(spans).toHaveLength(4);
            expect(spans.map(span => span.name).sort()).toEqual([
              'chat claude-3-5-sonnet-20241022',
              'invoke_agent',
              'invoke_agent format_prompt',
              'invoke_agent parse_output',
            ]);

            const formatPromptSpan = spans.find(span => span.name === 'invoke_agent format_prompt');
            expect(formatPromptSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(formatPromptSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
            expect(formatPromptSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
            expect(formatPromptSpan!.attributes[GEN_AI_PIPELINE_NAME].value).toBe('format_prompt');
            expect(formatPromptSpan!.attributes[LANGCHAIN_CHAIN_NAME]).toBeUndefined();

            const chatSpan = spans.find(span => span.name === 'chat claude-3-5-sonnet-20241022');
            expect(chatSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
            expect(chatSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');

            const parseOutputSpan = spans.find(span => span.name === 'invoke_agent parse_output');
            expect(parseOutputSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(parseOutputSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
            expect(parseOutputSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
            expect(parseOutputSpan!.attributes[GEN_AI_PIPELINE_NAME].value).toBe('parse_output');
            expect(parseOutputSpan!.attributes[LANGCHAIN_CHAIN_NAME]).toBeUndefined();

            const unknownChainSpan = spans.find(span => span.name === 'invoke_agent');
            expect(unknownChainSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(unknownChainSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
            expect(unknownChainSpan!.attributes[GEN_AI_PIPELINE_NAME]).toBeUndefined();
            expect(unknownChainSpan!.attributes[LANGCHAIN_CHAIN_NAME]).toBeUndefined();
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
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-3-small',
              'embeddings text-embedding-3-small',
            ]);

            const successfulSpans = spans.filter(
              span => span.name === 'embeddings text-embedding-3-small' && span.status === 'ok',
            );
            expect(successfulSpans).toHaveLength(2);
            for (const span of successfulSpans) {
              expect(span.attributes[SENTRY_OP].value).toBe(GEN_AI_EMBEDDINGS);
              expect(span.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
              expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('embeddings');
              expect(span.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(span.attributes[GEN_AI_REQUEST_MODEL].value).toBe('text-embedding-3-small');
              expect(span.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);
            }

            const errorSpan = spans.find(span => span.name === 'embeddings error-model');
            expect(errorSpan!.status).toBe('error');
            expect(errorSpan!.attributes[SENTRY_OP].value).toBe(GEN_AI_EMBEDDINGS);
            expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-embeddings.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates embedding spans with genAI recording enabled', async () => {
      const allSpans: SerializedStreamedSpanContainer['items'] = [];

      await createRunner()
        .unordered()
        .expect({
          span: container => {
            allSpans.push(...container.items);
            const segment = allSpans.find(span => span.is_segment && span.name === 'main');
            expect(segment).toBeDefined();
            const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
            expect(spans).toHaveLength(3);
            expect(spans.map(span => span.name).sort()).toEqual([
              'embeddings error-model',
              'embeddings text-embedding-3-small',
              'embeddings text-embedding-3-small',
            ]);

            const querySpan = spans.find(span => span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value === 'Hello world');
            expect(querySpan!.name).toBe('embeddings text-embedding-3-small');
            expect(querySpan!.status).toBe('ok');
            expect(querySpan!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE].value).toBe(1536);

            const documentsSpan = spans.find(
              span =>
                span.attributes[GEN_AI_EMBEDDINGS_INPUT]?.value ===
                JSON.stringify(['First document', 'Second document']),
            );
            expect(documentsSpan!.name).toBe('embeddings text-embedding-3-small');
            expect(documentsSpan!.status).toBe('ok');

            const errorSpan = spans.find(span => span.name === 'embeddings error-model');
            expect(errorSpan!.status).toBe('error');
          },
        })
        .start()
        .completed();
    });
  });
});
