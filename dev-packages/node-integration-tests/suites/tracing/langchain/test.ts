import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('LangChain integration', () => {
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
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'error-model',
        }),
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'internal_error',
      }),
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
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
        }),
        description: 'chat error-model',
        op: 'gen_ai.chat',
        origin: 'auto.ai.langchain',
        status: 'internal_error',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates langchain related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates langchain related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

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

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates langchain spans with tool calls', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_TOOL_CALLS }).start().completed();
    });
  });

  const EXPECTED_TRANSACTION_MESSAGE_TRUNCATION = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First call: String input truncated (only C's remain, D's are cropped)
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
      // Second call: Array input, last message truncated (only C's remain, D's are cropped)
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
      // Third call: Last message is small and kept without truncation
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.langchain',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
          // Small message should be kept intact
          'gen_ai.request.messages': JSON.stringify([
            { role: 'user', content: 'This is a small message that fits within the limit' },
          ]),
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
                span => span.description === 'chat claude-3-5-sonnet-20241022' && span.origin === 'auto.ai.anthropic',
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
                span => span.description === 'chat claude-3-5-sonnet-20241022' && span.origin === 'auto.ai.anthropic',
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
    // This test fails on CJS because we use dynamic imports to simulate importing LangChain after the Anthropic client is created
    { failsOnCjs: true },
  );
});
