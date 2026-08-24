import { afterAll, describe, expect } from 'vitest';
import {
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
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE } from '../../../../../../packages/server-utils/src/ai/core/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { createEsmTests } from '../../../../utils/runner/createEsmAndCjsTests';

describe('LangChain integration (v1)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
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
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
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
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tools.mjs',
    'instrument.mjs',
    (createRunner, test) => {
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
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-openai-before-langchain.mjs',
    'instrument.mjs',
    (createRunner, test) => {
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

              const langchainSpan = container.items.find(
                span => span.attributes['sentry.origin'].value === 'auto.ai.langchain',
              );
              expect(langchainSpan).toBeDefined();
              expect(langchainSpan!.name).toBe('chat claude-3-5-sonnet-20241022');

              // Third call (not present): Direct Anthropic call made AFTER LangChain import
              // is NOT instrumented, demonstrating the skip mechanism works for NEW clients.
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/anthropic': '^1.0.0',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-init-chat-model.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain spans using initChatModel with OpenAI', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(3);
              expect(container.items.map(span => span.name).sort()).toEqual([
                'chat error-model',
                'chat gpt-3.5-turbo',
                'chat gpt-4o',
              ]);

              const gpt4oSpan = container.items.find(span => span.name === 'chat gpt-4o');
              expect(gpt4oSpan).toBeDefined();
              expect(gpt4oSpan!.status).toBe('ok');
              expect(gpt4oSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(gpt4oSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(gpt4oSpan!.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
              expect(gpt4oSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(gpt4oSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-4o');
              expect(gpt4oSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.7);
              expect(gpt4oSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS].value).toBe(100);
              expect(gpt4oSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
              expect(gpt4oSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
              expect(gpt4oSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);
              expect(gpt4oSpan!.attributes[GEN_AI_RESPONSE_ID]).toBeDefined();
              expect(gpt4oSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4o');
              expect(gpt4oSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

              const gpt35Span = container.items.find(span => span.name === 'chat gpt-3.5-turbo');
              expect(gpt35Span).toBeDefined();
              expect(gpt35Span!.status).toBe('ok');
              expect(gpt35Span!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(gpt35Span!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(gpt35Span!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(gpt35Span!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-3.5-turbo');
              expect(gpt35Span!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
              expect(gpt35Span!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
              expect(gpt35Span!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
              expect(gpt35Span!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);
              expect(gpt35Span!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-3.5-turbo');
              expect(gpt35Span!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

              const errorSpan = container.items.find(span => span.name === 'chat error-model');
              expect(errorSpan).toBeDefined();
              expect(errorSpan!.status).toBe('error');
              expect(errorSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(errorSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        // Pinned: langchain 1.5.7 imports DEFAULT_LANGSMITH_GATEWAY from @langchain/core/utils/gateway,
        // which no published @langchain/core exports yet, breaking ESM named-export validation.
        // Restore ^1.0.0 once a @langchain/core release exports it.
        langchain: '1.5.6',
        '@langchain/core': '^1.0.0',
        '@langchain/openai': '^1.0.0',
      },
    },
  );
});
