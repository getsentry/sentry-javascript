import { afterAll, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
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
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// LangChain v1 requires Node.js 20+ (dropped Node 18 support)
// See: https://docs.langchain.com/oss/javascript/migrate/langgraph-v1#dropped-node-18-support
conditionalTest({ min: 20 })('LangChain integration (v1)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
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
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toMatch(
                /^\[\{"type":"text","content":"A+"\}\]$/,
              );

              // [2] Last message is small and kept without truncation
              expect(thirdSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(2);
              expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(
                JSON.stringify([{ role: 'user', content: 'This is a small message that fits within the limit' }]),
              );
              expect(thirdSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toMatch(
                /^\[\{"type":"text","content":"A+"\}\]$/,
              );
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

              // [0] Direct Anthropic call made BEFORE LangChain import — instrumented
              //     by Anthropic (origin: 'auto.ai.anthropic').
              expect(firstSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.anthropic');

              // [1] LangChain call — instrumented by LangChain (origin: 'auto.ai.langchain').
              expect(secondSpan!.name).toBe('chat claude-3-5-sonnet-20241022');
              expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');

              // Third call (not present): Direct Anthropic call made AFTER LangChain import
              // is NOT instrumented, demonstrating the skip mechanism works for NEW clients.
            },
          })
          .start()
          .completed();
      });
    },
    {
      failsOnCjs: true,
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
              const [firstSpan, secondSpan, thirdSpan] = container.items;

              // [0] initChatModel with gpt-4o
              expect(firstSpan!.name).toBe('chat gpt-4o');
              expect(firstSpan!.status).toBe('ok');
              expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('chat');
              expect(firstSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gpt-4o');
              expect(firstSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.7);
              expect(firstSpan!.attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE].value).toBe(100);
              expect(firstSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
              expect(firstSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
              expect(firstSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_ID_ATTRIBUTE]).toBeDefined();
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gpt-4o');
              expect(firstSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

              // [1] initChatModel with gpt-3.5-turbo
              expect(secondSpan!.name).toBe('chat gpt-3.5-turbo');
              expect(secondSpan!.status).toBe('ok');
              expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
              expect(secondSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('gpt-3.5-turbo');
              expect(secondSpan!.attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE].value).toBe(0.5);
              expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(8);
              expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(12);
              expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(20);
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gpt-3.5-turbo');
              expect(secondSpan!.attributes[GEN_AI_RESPONSE_STOP_REASON_ATTRIBUTE].value).toBe('stop');

              // [2] error handling
              expect(thirdSpan!.name).toBe('chat error-model');
              expect(thirdSpan!.status).toBe('error');
              expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(thirdSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langchain');
              expect(thirdSpan!.attributes[GEN_AI_SYSTEM_ATTRIBUTE].value).toBe('openai');
              expect(thirdSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE].value).toBe('error-model');
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
        '@langchain/openai': '^1.0.0',
      },
    },
  );
});
