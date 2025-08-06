import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Anthropic integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic message completion without PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages.create',
          'sentry.op': 'gen_ai.messages.create',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.response.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'msg_mock123',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
        },
        description: 'messages.create claude-3-haiku-20240307',
        op: 'gen_ai.messages.create',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Second span - error handling
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages.create',
          'sentry.op': 'gen_ai.messages.create',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'error-model',
        },
        description: 'messages.create error-model',
        op: 'gen_ai.messages.create',
        origin: 'auto.ai.anthropic',
        status: 'unknown_error',
      }),
      // Third span - token counting (no response.text because recordOutputs=false by default)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages.countTokens',
          'sentry.op': 'gen_ai.messages.countTokens',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
        },
        description: 'messages.countTokens claude-3-haiku-20240307',
        op: 'gen_ai.messages.countTokens',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Fourth span - models.retrieve
      expect.objectContaining({
        data: {
          'anthropic.response.timestamp': '2024-05-08T05:20:00.000Z',
          'gen_ai.operation.name': 'retrieve',
          'sentry.op': 'gen_ai.retrieve',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'claude-3-haiku-20240307',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
        },
        description: 'retrieve claude-3-haiku-20240307',
        op: 'gen_ai.retrieve',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - basic message completion with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages.create',
          'sentry.op': 'gen_ai.messages.create',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.request.temperature': 0.7,
          'gen_ai.request.max_tokens': 100,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the capital of France?"}]',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'msg_mock123',
          'gen_ai.response.text': 'Hello from Anthropic mock!',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
        },
        description: 'messages.create claude-3-haiku-20240307',
        op: 'gen_ai.messages.create',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Second span - error handling with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages.create',
          'sentry.op': 'gen_ai.messages.create',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': '[{"role":"user","content":"This will fail"}]',
        },
        description: 'messages.create error-model',
        op: 'gen_ai.messages.create',

        origin: 'auto.ai.anthropic',
        status: 'unknown_error',
      }),
      // Third span - token counting with PII (response.text is present because sendDefaultPii=true enables recordOutputs)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages.countTokens',
          'sentry.op': 'gen_ai.messages.countTokens',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.request.messages': '[{"role":"user","content":"What is the capital of France?"}]',
          'gen_ai.response.text': '15', // Only present because recordOutputs=true when sendDefaultPii=true
        },
        description: 'messages.countTokens claude-3-haiku-20240307',
        op: 'gen_ai.messages.countTokens',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Fourth span - models.retrieve with PII
      expect.objectContaining({
        data: {
          'anthropic.response.timestamp': '2024-05-08T05:20:00.000Z',
          'gen_ai.operation.name': 'retrieve',
          'sentry.op': 'gen_ai.retrieve',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'claude-3-haiku-20240307',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
        },
        description: 'retrieve claude-3-haiku-20240307',
        op: 'gen_ai.retrieve',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_WITH_OPTIONS = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // Check that custom options are respected
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': expect.any(String), // Should include response text when recordOutputs: true
        }),
      }),
      // Check token counting with options
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'messages.countTokens',
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': '15', // Present because recordOutputs=true is set in options
        }),
        op: 'gen_ai.messages.countTokens',
      }),
      // Check models.retrieve with options
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'retrieve',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'claude-3-haiku-20240307',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
        }),
        op: 'gen_ai.retrieve',
        description: 'retrieve claude-3-haiku-20240307',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates anthropic related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates anthropic related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-options.mjs', (createRunner, test) => {
    test('creates anthropic related spans with custom options', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_WITH_OPTIONS })
        .start()
        .completed();
    });
  });
});
