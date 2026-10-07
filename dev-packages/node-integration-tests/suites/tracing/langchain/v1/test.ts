import type { SerializedStreamedSpanContainer } from '@sentry/core';
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
  SENTRY_OP,
  SENTRY_ORIGIN,
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
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
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
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
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
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
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
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(
          span =>
            span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain' ||
            span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.anthropic',
        );
        expect(spans).toHaveLength(2);
        const anthropicSpan = spans.find(span => span.attributes[SENTRY_ORIGIN].value === 'auto.ai.anthropic');
        expect(anthropicSpan!.name).toBe('chat claude-3-5-sonnet-20241022');

        const langchainSpan = spans.find(span => span.attributes[SENTRY_ORIGIN].value === 'auto.ai.langchain');
        expect(langchainSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
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
        let receivedSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .ignore('event')
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
              receivedSpans = container.items;
            },
          })
          .start()
          .completed();

        const spans = receivedSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langchain');
        expect(spans).toHaveLength(3);
        expect(spans.map(span => span.name).sort()).toEqual(['chat error-model', 'chat gpt-3.5-turbo', 'chat gpt-4o']);

        const gpt4oSpan = spans.find(span => span.name === 'chat gpt-4o');
        expect(gpt4oSpan!.status).toBe('ok');
        expect(gpt4oSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(gpt4oSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
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

        const gpt35Span = spans.find(span => span.name === 'chat gpt-3.5-turbo');
        expect(gpt35Span!.status).toBe('ok');
        expect(gpt35Span!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(gpt35Span!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(gpt35Span!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
        expect(gpt35Span!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-3.5-turbo');
        expect(gpt35Span!.attributes[GEN_AI_REQUEST_TEMPERATURE].value).toBe(0.5);
        expect(gpt35Span!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(8);
        expect(gpt35Span!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(12);
        expect(gpt35Span!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(20);
        expect(gpt35Span!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-3.5-turbo');
        expect(gpt35Span!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

        const errorSpan = spans.find(span => span.name === 'chat error-model');
        expect(errorSpan!.status).toBe('error');
        expect(errorSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.chat');
        expect(errorSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langchain');
        expect(errorSpan!.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
        expect(errorSpan!.attributes[GEN_AI_REQUEST_MODEL].value).toBe('error-model');
      });
    },
    {
      additionalDependencies: {
        langchain: '^1.0.0',
        '@langchain/core': '^1.0.0',
        '@langchain/openai': '^1.0.0',
      },
    },
  );
});
