import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// LangChain v1 requires Node.js 20+ (dropped Node 18 support)
// See: https://docs.langchain.com/oss/javascript/migrate/langgraph-v1#dropped-node-18-support
conditionalTest({ min: 20 })('LangChain integration (v1)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chat model with claude-3-5-sonnet
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': expect.any(String),
          'gen_ai.response.stop_reason': expect.any(String),
        }),
        description: 'chat claude-3-5-sonnet-20241022',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      // Second span - chat model with claude-3-opus
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-opus-20240229',
          'gen_ai.request.temperature': 0.9,
          'gen_ai.request.top_p': 0.95,
          'gen_ai.request.max_tokens': 200,
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': expect.any(String),
          'gen_ai.response.stop_reason': expect.any(String),
        }),
        description: 'chat claude-3-opus-20240229',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      // Third span - error handling
      // expect.objectContaining({
      //   data: expect.objectContaining({
      //     'gen_ai.operation.name': 'chat',
      //     'sentry.op': 'gen_ai.chat',
      //     'sentry.origin': 'auto.ai.langchain',
      //     'gen_ai.system': 'anthropic',
      //     'gen_ai.request.model': 'error-model',
      //   }),
      //   description: 'chat error-model',
      //   op: 'gen_ai.chat',
      //   origin: 'auto.ai.langchain',
      //   status: 'internal_error',
      // }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chat model with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response when recordOutputs: true
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': expect.any(String),
          'gen_ai.response.stop_reason': expect.any(String),
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
        }),
        description: 'chat claude-3-5-sonnet-20241022',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      // Second span - chat model with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-opus-20240229',
          'gen_ai.request.temperature': 0.9,
          'gen_ai.request.top_p': 0.95,
          'gen_ai.request.max_tokens': 200,
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response when recordOutputs: true
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': expect.any(String),
          'gen_ai.response.stop_reason': expect.any(String),
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
        }),
        description: 'chat claude-3-opus-20240229',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      // Third span - error handling with PII
      // expect.objectContaining({
      //   data: expect.objectContaining({
      //     'gen_ai.operation.name': 'chat',
      //     'sentry.op': 'gen_ai.chat',
      //     'sentry.origin': 'auto.ai.langchain',
      //     'gen_ai.system': 'anthropic',
      //     'gen_ai.request.model': 'error-model',
      //     'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
      //   }),
      //   description: 'chat error-model',
      //   op: 'gen_ai.chat',
      //   origin: 'auto.ai.langchain',
      //   status: 'internal_error',
      // }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain related spans with sendDefaultPii: false', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
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
          .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
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

  const EXPECTED_TRANSACTION_TOOL_CALLS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.max_tokens': 150,
          'gen_ai.usage.input_tokens': 20,
          'gen_ai.usage.output_tokens': 30,
          'gen_ai.usage.total_tokens': 50,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': expect.any(String),
          'gen_ai.response.stop_reason': 'tool_use',
          'gen_ai.response.tool_calls': expect.any(String),
        }),
        description: 'chat claude-3-5-sonnet-20241022',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario-tools.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain spans with tool calls', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: EXPECTED_TRANSACTION_TOOL_CALLS })
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

  const EXPECTED_TRANSACTION_MESSAGE_TRUNCATION = {
    transaction: 'main',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
          // Messages should be present and should include truncated string input (contains only Cs)
          'gen_ai.request.messages': expect.stringMatching(/^\[\{"role":"user","content":"C+"\}\]$/),
        }),
        description: 'chat claude-3-5-sonnet-20241022',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
          // Messages should be present (truncation happened) and should be a JSON array of a single index (contains only Cs)
          'gen_ai.request.messages': expect.stringMatching(/^\[\{"role":"user","content":"C+"\}\]$/),
        }),
        description: 'chat claude-3-5-sonnet-20241022',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario-message-truncation.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('truncates messages when they exceed byte limit', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: EXPECTED_TRANSACTION_MESSAGE_TRUNCATION })
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
          .expect({
            transaction: event => {
              // This test highlights the limitation: if a user creates an Anthropic client
              // before importing LangChain, that client will still be instrumented and
              // could cause duplicate spans when used alongside LangChain.

              const spans = event.spans || [];

              // First call: Direct Anthropic call made BEFORE LangChain import
              // This should have Anthropic instrumentation (origin: 'auto.ai.anthropic')
              const firstAnthropicSpan = spans.find(
                span =>
                  span.description === 'messages claude-3-5-sonnet-20241022' && span.origin === 'auto.ai.anthropic',
              );

              // Second call: LangChain call
              // This should have LangChain instrumentation (origin: 'auto.ai.langchain')
              const langchainSpan = spans.find(
                span => span.description === 'chat claude-3-5-sonnet-20241022' && span.origin === 'auto.ai.langchain',
              );

              // Third call: Direct Anthropic call made AFTER LangChain import
              // This should NOT have Anthropic instrumentation (skip works correctly)
              // Count how many Anthropic spans we have - should be exactly 1
              const anthropicSpans = spans.filter(
                span =>
                  span.description === 'messages claude-3-5-sonnet-20241022' && span.origin === 'auto.ai.anthropic',
              );

              // Verify the edge case limitation:
              // - First Anthropic client (created before LangChain) IS instrumented
              expect(firstAnthropicSpan).toBeDefined();
              expect(firstAnthropicSpan?.origin).toBe('auto.ai.anthropic');

              // - LangChain call IS instrumented by LangChain
              expect(langchainSpan).toBeDefined();
              expect(langchainSpan?.origin).toBe('auto.ai.langchain');

              // - Second Anthropic client (created after LangChain) is NOT instrumented
              // This demonstrates that the skip mechanism works for NEW clients
              // We should only have ONE Anthropic span (the first one), not two
              expect(anthropicSpans).toHaveLength(1);
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

  const EXPECTED_TRANSACTION_INIT_CHAT_MODEL = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - initChatModel with gpt-4o
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4o',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'gpt-4o',
          'gen_ai.response.stop_reason': 'stop',
        }),
        description: 'chat gpt-4o',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      // Second span - initChatModel with gpt-3.5-turbo
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-3.5-turbo',
          'gen_ai.request.temperature': 0.5,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'gpt-3.5-turbo',
          'gen_ai.response.stop_reason': 'stop',
        }),
        description: 'chat gpt-3.5-turbo',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'ok',
      }),
      // Third span - error handling
      // expect.objectContaining({
      //   data: expect.objectContaining({
      //     'gen_ai.operation.name': 'chat',
      //     'sentry.op': 'gen_ai.chat',
      //     'sentry.origin': 'auto.ai.langchain',
      //     'gen_ai.system': 'openai',
      //     'gen_ai.request.model': 'error-model',
      //   }),
      //   description: 'chat error-model',
      //   op: 'gen_ai.chat',
      //   origin: 'auto.ai.langchain',
      //   status: 'internal_error',
      // }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario-init-chat-model.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates langchain spans using initChatModel with OpenAI', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: EXPECTED_TRANSACTION_INIT_CHAT_MODEL })
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
