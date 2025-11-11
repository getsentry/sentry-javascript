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
  );
});
