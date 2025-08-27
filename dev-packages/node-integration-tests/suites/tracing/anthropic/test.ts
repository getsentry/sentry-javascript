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
          'gen_ai.operation.name': 'messages',
          'sentry.op': 'gen_ai.messages',
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
        description: 'messages claude-3-haiku-20240307',
        op: 'gen_ai.messages',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Second span - error handling
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages',
          'sentry.op': 'gen_ai.messages',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'error-model',
        },
        description: 'messages error-model',
        op: 'gen_ai.messages',
        origin: 'auto.ai.anthropic',
        status: 'unknown_error',
      }),
      // Third span - token counting (no response.text because recordOutputs=false by default)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages',
          'sentry.op': 'gen_ai.messages',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
        },
        description: 'messages claude-3-haiku-20240307',
        op: 'gen_ai.messages',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Fourth span - models.retrieve
      expect.objectContaining({
        data: {
          'anthropic.response.timestamp': '2024-05-08T05:20:00.000Z',
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'claude-3-haiku-20240307',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
        },
        description: 'models claude-3-haiku-20240307',
        op: 'gen_ai.models',
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
          'gen_ai.operation.name': 'messages',
          'sentry.op': 'gen_ai.messages',
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
        description: 'messages claude-3-haiku-20240307',
        op: 'gen_ai.messages',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Second span - error handling with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages',
          'sentry.op': 'gen_ai.messages',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'error-model',
          'gen_ai.request.messages': '[{"role":"user","content":"This will fail"}]',
        },
        description: 'messages error-model',
        op: 'gen_ai.messages',
        origin: 'auto.ai.anthropic',
        status: 'unknown_error',
      }),
      // Third span - token counting with PII (response.text is present because sendDefaultPii=true enables recordOutputs)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'messages',
          'sentry.op': 'gen_ai.messages',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.request.messages': '[{"role":"user","content":"What is the capital of France?"}]',
          'gen_ai.response.text': '15', // Only present because recordOutputs=true when sendDefaultPii=true
        },
        description: 'messages claude-3-haiku-20240307',
        op: 'gen_ai.messages',
        origin: 'auto.ai.anthropic',
        status: 'ok',
      }),
      // Fourth span - models.retrieve with PII
      expect.objectContaining({
        data: {
          'anthropic.response.timestamp': '2024-05-08T05:20:00.000Z',
          'gen_ai.operation.name': 'models',
          'sentry.op': 'gen_ai.models',
          'sentry.origin': 'auto.ai.anthropic',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'claude-3-haiku-20240307',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
        },
        description: 'models claude-3-haiku-20240307',
        op: 'gen_ai.models',
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
          'gen_ai.operation.name': 'messages',
          'gen_ai.request.messages': expect.any(String), // Should include messages when recordInputs: true
          'gen_ai.response.text': '15', // Present because recordOutputs=true is set in options
        }),
        op: 'gen_ai.messages',
      }),
      // Check models.retrieve with options
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'models',
          'gen_ai.system': 'anthropic',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'claude-3-haiku-20240307',
          'gen_ai.response.model': 'claude-3-haiku-20240307',
        }),
        op: 'gen_ai.models',
        description: 'models claude-3-haiku-20240307',
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

  const EXPECTED_STREAM_SPANS_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // messages.create with stream: true
      expect.objectContaining({
        description: 'messages claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.messages',
        data: expect.objectContaining({
          'gen_ai.system': 'anthropic',
          'gen_ai.operation.name': 'messages',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.request.stream': true,
          'gen_ai.response.streaming': true,
          'gen_ai.response.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'msg_stream_1',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
          'gen_ai.response.finish_reasons': '["end_turn"]',
        }),
      }),
      // messages.stream
      expect.objectContaining({
        description: 'messages claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.messages',
        data: expect.objectContaining({
          'gen_ai.system': 'anthropic',
          'gen_ai.operation.name': 'messages',
          'gen_ai.request.model': 'claude-3-haiku-20240307',
          'gen_ai.response.streaming': true,
          'gen_ai.response.model': 'claude-3-haiku-20240307',
          'gen_ai.response.id': 'msg_stream_1',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 25,
        }),
      }),
    ]),
  };

  const EXPECTED_STREAM_SPANS_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'messages claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.messages',
        data: expect.objectContaining({
          'gen_ai.response.streaming': true,
          // streamed text concatenated
          'gen_ai.response.text': 'Hello from stream!',
        }),
      }),
      expect.objectContaining({
        description: 'messages claude-3-haiku-20240307 stream-response',
        op: 'gen_ai.messages',
        data: expect.objectContaining({
          'gen_ai.response.streaming': true,
          'gen_ai.response.text': 'Hello from stream!',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument.mjs', (createRunner, test) => {
    test('streams produce spans with token usage and metadata (PII false)', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_STREAM_SPANS_PII_FALSE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stream.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('streams record response text when PII true', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_STREAM_SPANS_PII_TRUE }).start().completed();
    });
  });
});
