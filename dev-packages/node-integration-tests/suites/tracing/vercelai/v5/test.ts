import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('Vercel AI integration (V5)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - no telemetry config, should enable telemetry but not record inputs/outputs when sendDefaultPii: false
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'ai.generateText',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Second span - explicitly enabled telemetry but recordInputs/recordOutputs not set, should not record when sendDefaultPii: false
      expect.objectContaining({
        data: {
          'sentry.origin': 'auto.vercelai.otel',
          'sentry.op': 'gen_ai.generate_text',
          'gen_ai.operation.name': 'ai.generateText.doGenerate',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.model.provider': 'mock-provider',
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.settings.maxRetries': 2,
          'gen_ai.system': 'mock-provider',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.streaming': false,
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.timestamp': expect.any(String),
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.total_tokens': 30,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Third span - explicit telemetry enabled, should record inputs/outputs regardless of sendDefaultPii
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"Where is the second span?"}',
          'vercel.ai.response.finishReason': 'stop',
          'gen_ai.response.text': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.prompt': '{"prompt":"Where is the second span?"}',
          'gen_ai.request.messages': '[{"role":"user","content":"Where is the second span?"}]',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'ai.generateText',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Fourth span - doGenerate for explicit telemetry enabled call
      expect.objectContaining({
        data: {
          'sentry.origin': 'auto.vercelai.otel',
          'sentry.op': 'gen_ai.generate_text',
          'gen_ai.operation.name': 'ai.generateText.doGenerate',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.model.provider': 'mock-provider',
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.settings.maxRetries': 2,
          'gen_ai.system': 'mock-provider',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.streaming': false,
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.id': expect.any(String),
          'gen_ai.response.text': expect.any(String),
          'vercel.ai.response.timestamp': expect.any(String),
          'gen_ai.request.messages': expect.any(String),
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.total_tokens': 30,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Fifth span - tool call generateText span
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'ai.generateText',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Sixth span - tool call doGenerate span
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.response.finish_reasons': ['tool-calls'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'ai.generateText.doGenerate',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Seventh span - tool call execution span
      expect.objectContaining({
        data: {
          'vercel.ai.operationId': 'ai.toolCall',
          'gen_ai.tool.call.id': 'call-1',
          'gen_ai.tool.name': 'getWeather',
          'gen_ai.tool.type': 'function',
          'gen_ai.operation.name': 'ai.toolCall',
          'sentry.op': 'gen_ai.execute_tool',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'execute_tool getWeather',
        op: 'gen_ai.execute_tool',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_AVAILABLE_TOOLS_JSON =
    '[{"type":"function","name":"getWeather","inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"location":{"type":"string"}},"required":["location"],"additionalProperties":false}}]';

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - no telemetry config, should enable telemetry AND record inputs/outputs when sendDefaultPii: true
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"Where is the first span?"}',
          'gen_ai.request.messages': '[{"role":"user","content":"Where is the first span?"}]',
          'vercel.ai.response.finishReason': 'stop',
          'gen_ai.response.text': 'First span here!',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.prompt': '{"prompt":"Where is the first span?"}',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'ai.generateText',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Second span - doGenerate for first call, should also include input/output fields when sendDefaultPii: true
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'gen_ai.request.messages': '[{"role":"user","content":[{"type":"text","text":"Where is the first span?"}]}]',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'gen_ai.response.text': 'First span here!',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'ai.generateText.doGenerate',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Third span - explicitly enabled telemetry, should record inputs/outputs regardless of sendDefaultPii
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"Where is the second span?"}',
          'gen_ai.request.messages': '[{"role":"user","content":"Where is the second span?"}]',
          'vercel.ai.response.finishReason': 'stop',
          'gen_ai.response.text': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.prompt': '{"prompt":"Where is the second span?"}',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'ai.generateText',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Fourth span - doGenerate for explicitly enabled telemetry call
      expect.objectContaining({
        data: {
          'sentry.origin': 'auto.vercelai.otel',
          'sentry.op': 'gen_ai.generate_text',
          'gen_ai.operation.name': 'ai.generateText.doGenerate',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.model.provider': 'mock-provider',
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.settings.maxRetries': 2,
          'gen_ai.system': 'mock-provider',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.streaming': false,
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.id': expect.any(String),
          'gen_ai.response.text': expect.any(String),
          'vercel.ai.response.timestamp': expect.any(String),
          'gen_ai.request.messages': expect.any(String),
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.total_tokens': 30,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Fifth span - tool call generateText span (should include prompts when sendDefaultPii: true)
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"What is the weather in San Francisco?"}',
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather in San Francisco?"}]',
          'vercel.ai.response.finishReason': 'tool-calls',
          'gen_ai.response.tool_calls': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.prompt': '{"prompt":"What is the weather in San Francisco?"}',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'ai.generateText',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Sixth span - tool call doGenerate span (should include prompts when sendDefaultPii: true)
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'gen_ai.request.messages': expect.any(String),
          'vercel.ai.prompt.toolChoice': expect.any(String),
          'gen_ai.request.available_tools': EXPECTED_AVAILABLE_TOOLS_JSON,
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          // 'gen_ai.response.text': 'Tool call completed!', // TODO: look into why this is not being set
          'vercel.ai.response.timestamp': expect.any(String),
          'gen_ai.response.tool_calls': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
          'gen_ai.response.finish_reasons': ['tool-calls'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'ai.generateText.doGenerate',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Seventh span - tool call execution span
      expect.objectContaining({
        data: {
          'vercel.ai.operationId': 'ai.toolCall',
          'gen_ai.tool.call.id': 'call-1',
          'gen_ai.tool.name': 'getWeather',
          'gen_ai.tool.input': expect.any(String),
          'gen_ai.tool.output': expect.any(String),
          'gen_ai.tool.type': 'function',
          'gen_ai.operation.name': 'ai.toolCall',
          'sentry.op': 'gen_ai.execute_tool',
          'sentry.origin': 'auto.vercelai.otel',
        },
        description: 'execute_tool getWeather',
        op: 'gen_ai.execute_tool',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans with sendDefaultPii: false', async () => {
        await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE }).start().completed();
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates ai related spans with sendDefaultPii: true', async () => {
        await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE }).start().completed();
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error-in-tool.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures error in tool', async () => {
        const expectedTransaction = {
          transaction: 'main',
          spans: expect.arrayContaining([
            expect.objectContaining({
              data: {
                'gen_ai.request.model': 'mock-model-id',
                'vercel.ai.model.provider': 'mock-provider',
                'vercel.ai.operationId': 'ai.generateText',
                'vercel.ai.pipeline.name': 'generateText',
                'vercel.ai.settings.maxRetries': 2,
                'vercel.ai.streaming': false,
                'gen_ai.response.model': 'mock-model-id',
                'gen_ai.usage.input_tokens': 15,
                'gen_ai.usage.output_tokens': 25,
                'gen_ai.usage.total_tokens': 40,
                'gen_ai.operation.name': 'ai.generateText',
                'sentry.op': 'gen_ai.invoke_agent',
                'sentry.origin': 'auto.vercelai.otel',
                'vercel.ai.response.finishReason': 'tool-calls',
              },
              description: 'generateText',
              op: 'gen_ai.invoke_agent',
              origin: 'auto.vercelai.otel',
            }),
            expect.objectContaining({
              data: {
                'gen_ai.request.model': 'mock-model-id',
                'vercel.ai.model.provider': 'mock-provider',
                'vercel.ai.operationId': 'ai.generateText.doGenerate',
                'vercel.ai.pipeline.name': 'generateText.doGenerate',
                'vercel.ai.response.finishReason': 'tool-calls',
                'vercel.ai.response.id': expect.any(String),
                'vercel.ai.response.model': 'mock-model-id',
                'vercel.ai.response.timestamp': expect.any(String),
                'vercel.ai.settings.maxRetries': 2,
                'vercel.ai.streaming': false,
                'gen_ai.response.finish_reasons': ['tool-calls'],
                'gen_ai.response.id': expect.any(String),
                'gen_ai.response.model': 'mock-model-id',
                'gen_ai.system': 'mock-provider',
                'gen_ai.usage.input_tokens': 15,
                'gen_ai.usage.output_tokens': 25,
                'gen_ai.usage.total_tokens': 40,
                'gen_ai.operation.name': 'ai.generateText.doGenerate',
                'sentry.op': 'gen_ai.generate_text',
                'sentry.origin': 'auto.vercelai.otel',
              },
              description: 'generate_text mock-model-id',
              op: 'gen_ai.generate_text',
              origin: 'auto.vercelai.otel',
              status: 'ok',
            }),
            expect.objectContaining({
              data: {
                'vercel.ai.operationId': 'ai.toolCall',
                'gen_ai.tool.call.id': 'call-1',
                'gen_ai.tool.name': 'getWeather',
                'gen_ai.tool.type': 'function',
                'gen_ai.operation.name': 'ai.toolCall',
                'sentry.op': 'gen_ai.execute_tool',
                'sentry.origin': 'auto.vercelai.otel',
              },
              description: 'execute_tool getWeather',
              op: 'gen_ai.execute_tool',
              origin: 'auto.vercelai.otel',
              status: 'internal_error',
            }),
          ]),
        };

        const expectedError = {
          level: 'error',
          tags: expect.objectContaining({
            'vercel.ai.tool.name': 'getWeather',
            'vercel.ai.tool.callId': 'call-1',
          }),
        };

        let transactionEvent: Event | undefined;
        let errorEvent: Event | undefined;

        await createRunner()
          .expect({
            transaction: transaction => {
              transactionEvent = transaction;
            },
          })
          .expect({
            event: event => {
              errorEvent = event;
            },
          })
          .start()
          .completed();

        expect(transactionEvent).toBeDefined();
        expect(transactionEvent).toMatchObject(expectedTransaction);

        expect(errorEvent).toBeDefined();
        expect(errorEvent).toMatchObject(expectedError);

        // Trace id should be the same for the transaction and error event
        expect(transactionEvent!.contexts!.trace!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans with v5', async () => {
        await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE }).start().completed();
      });
    },
    {
      additionalDependencies: {
        ai: '5.0.30',
      },
    },
  );
});
