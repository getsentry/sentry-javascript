import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Vercel AI integration', () => {
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
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.settings.maxSteps': 1,
          'vercel.ai.streaming': false,
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Second span - explicitly enabled telemetry but recordInputs/recordOutputs not set, should not record when sendDefaultPii: false
      expect.objectContaining({
        data: {
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Third span - explicit telemetry enabled, should record inputs/outputs regardless of sendDefaultPii
      expect.objectContaining({
        data: {
          'gen_ai.prompt': '{"prompt":"Where is the second span?"}',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"Where is the second span?"}]',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': expect.any(String),
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"Where is the second span?"}',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.settings.maxSteps': 1,
          'vercel.ai.streaming': false,
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Fourth span - doGenerate for explicit telemetry enabled call
      expect.objectContaining({
        data: {
          'gen_ai.request.messages': expect.any(String),
          'gen_ai.request.messages.original_length': expect.any(Number),
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': expect.any(String),
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.prompt.format': expect.any(String),
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
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
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.settings.maxSteps': 1,
          'vercel.ai.streaming': false,
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
          'gen_ai.response.finish_reasons': ['tool-calls'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
      // Seventh span - tool call execution span
      expect.objectContaining({
        data: {
          'gen_ai.tool.call.id': 'call-1',
          'gen_ai.tool.name': 'getWeather',
          'gen_ai.tool.type': 'function',
          'gen_ai.operation.name': 'execute_tool',
          'operation.name': 'execute_tool',
          'sentry.op': 'gen_ai.execute_tool',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.operationId': 'ai.toolCall',
        },
        description: 'execute_tool getWeather',
        op: 'gen_ai.execute_tool',
        origin: 'auto.vercelai.otel',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_AVAILABLE_TOOLS_JSON =
    '[{"type":"function","name":"getWeather","parameters":{"type":"object","properties":{"location":{"type":"string"}},"required":["location"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}}]';

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - no telemetry config, should enable telemetry AND record inputs/outputs when sendDefaultPii: true
      expect.objectContaining({
        data: {
          'gen_ai.prompt': '{"prompt":"Where is the first span?"}',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"Where is the first span?"}]',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': 'First span here!',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"Where is the first span?"}',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.settings.maxSteps': 1,
          'vercel.ai.streaming': false,
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
      // Second span - doGenerate for first call, should also include input/output fields when sendDefaultPii: true
      expect.objectContaining({
        data: {
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":[{"type":"text","text":"Where is the first span?"}]}]',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': 'First span here!',
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.prompt.format': 'prompt',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
      // Third span - explicitly enabled telemetry, should record inputs/outputs regardless of sendDefaultPii
      expect.objectContaining({
        data: {
          'gen_ai.prompt': '{"prompt":"Where is the second span?"}',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"Where is the second span?"}]',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': expect.any(String),
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"Where is the second span?"}',
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.settings.maxSteps': 1,
          'vercel.ai.streaming': false,
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
      // Fourth span - doGenerate for explicitly enabled telemetry call
      expect.objectContaining({
        data: {
          'gen_ai.request.messages': expect.any(String),
          'gen_ai.request.messages.original_length': expect.any(Number),
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': expect.any(String),
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 20,
          'gen_ai.usage.total_tokens': 30,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.prompt.format': expect.any(String),
          'vercel.ai.response.finishReason': 'stop',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
      // Fifth span - tool call generateText span (should include prompts when sendDefaultPii: true)
      expect.objectContaining({
        data: {
          'gen_ai.prompt': '{"prompt":"What is the weather in San Francisco?"}',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather in San Francisco?"}]',
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': 'Tool call completed!',
          'gen_ai.response.tool_calls': expect.any(String),
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText',
          'vercel.ai.pipeline.name': 'generateText',
          'vercel.ai.prompt': '{"prompt":"What is the weather in San Francisco?"}',
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.settings.maxSteps': 1,
          'vercel.ai.streaming': false,
        },
        description: 'generateText',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
      // Sixth span - tool call doGenerate span (should include prompts when sendDefaultPii: true)
      expect.objectContaining({
        data: {
          'gen_ai.request.available_tools': EXPECTED_AVAILABLE_TOOLS_JSON,
          'gen_ai.request.messages': expect.any(String),
          'gen_ai.request.messages.original_length': expect.any(Number),
          'gen_ai.request.model': 'mock-model-id',
          'gen_ai.response.finish_reasons': ['tool-calls'],
          'gen_ai.response.id': expect.any(String),
          'gen_ai.response.model': 'mock-model-id',
          'gen_ai.response.text': 'Tool call completed!',
          'gen_ai.response.tool_calls': expect.any(String),
          'gen_ai.system': 'mock-provider',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'gen_ai.operation.name': 'generate_content',
          'operation.name': 'generate_content',
          'sentry.op': 'gen_ai.generate_text',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.model.provider': 'mock-provider',
          'vercel.ai.operationId': 'ai.generateText.doGenerate',
          'vercel.ai.pipeline.name': 'generateText.doGenerate',
          'vercel.ai.prompt.format': expect.any(String),
          'vercel.ai.prompt.toolChoice': expect.any(String),
          'vercel.ai.response.finishReason': 'tool-calls',
          'vercel.ai.response.id': expect.any(String),
          'vercel.ai.response.model': 'mock-model-id',
          'vercel.ai.response.timestamp': expect.any(String),
          'vercel.ai.settings.maxRetries': 2,
          'vercel.ai.streaming': false,
        },
        description: 'generate_text mock-model-id',
        op: 'gen_ai.generate_text',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
      // Seventh span - tool call execution span
      expect.objectContaining({
        data: {
          'gen_ai.tool.call.id': 'call-1',
          'gen_ai.tool.input': expect.any(String),
          'gen_ai.tool.name': 'getWeather',
          'gen_ai.tool.output': expect.any(String),
          'gen_ai.tool.type': 'function',
          'gen_ai.operation.name': 'execute_tool',
          'operation.name': 'execute_tool',
          'sentry.op': 'gen_ai.execute_tool',
          'sentry.origin': 'auto.vercelai.otel',
          'vercel.ai.operationId': 'ai.toolCall',
        },
        description: 'execute_tool getWeather',
        op: 'gen_ai.execute_tool',
        origin: 'auto.vercelai.otel',
        status: 'ok',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates ai related spans with sendDefaultPii: false', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates ai related spans with sendDefaultPii: true', async () => {
      await createRunner().expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE }).start().completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures error in tool', async () => {
      const expectedTransaction = {
        transaction: 'main',
        spans: expect.arrayContaining([
          expect.objectContaining({
            data: {
              'gen_ai.request.model': 'mock-model-id',
              'gen_ai.response.model': 'mock-model-id',
              'gen_ai.usage.input_tokens': 15,
              'gen_ai.usage.output_tokens': 25,
              'gen_ai.usage.total_tokens': 40,
              'gen_ai.operation.name': 'generate_content',
              'operation.name': 'generate_content',
              'sentry.op': 'gen_ai.invoke_agent',
              'sentry.origin': 'auto.vercelai.otel',
              'vercel.ai.model.provider': 'mock-provider',
              'vercel.ai.operationId': 'ai.generateText',
              'vercel.ai.pipeline.name': 'generateText',
              'vercel.ai.settings.maxRetries': 2,
              'vercel.ai.settings.maxSteps': 1,
              'vercel.ai.streaming': false,
            },
            description: 'generateText',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.vercelai.otel',
            status: 'internal_error',
          }),
          expect.objectContaining({
            data: {
              'gen_ai.request.model': 'mock-model-id',
              'gen_ai.response.finish_reasons': ['tool-calls'],
              'gen_ai.response.id': expect.any(String),
              'gen_ai.response.model': 'mock-model-id',
              'gen_ai.system': 'mock-provider',
              'gen_ai.usage.input_tokens': 15,
              'gen_ai.usage.output_tokens': 25,
              'gen_ai.usage.total_tokens': 40,
              'gen_ai.operation.name': 'generate_content',
              'operation.name': 'generate_content',
              'sentry.op': 'gen_ai.generate_text',
              'sentry.origin': 'auto.vercelai.otel',
              'vercel.ai.model.provider': 'mock-provider',
              'vercel.ai.operationId': 'ai.generateText.doGenerate',
              'vercel.ai.pipeline.name': 'generateText.doGenerate',
              'vercel.ai.response.finishReason': 'tool-calls',
              'vercel.ai.response.id': expect.any(String),
              'vercel.ai.response.model': 'mock-model-id',
              'vercel.ai.response.timestamp': expect.any(String),
              'vercel.ai.settings.maxRetries': 2,
              'vercel.ai.streaming': false,
            },
            description: 'generate_text mock-model-id',
            op: 'gen_ai.generate_text',
            origin: 'auto.vercelai.otel',
            status: 'ok',
          }),
          expect.objectContaining({
            data: {
              'gen_ai.tool.call.id': 'call-1',
              'gen_ai.tool.name': 'getWeather',
              'gen_ai.tool.type': 'function',
              'gen_ai.operation.name': 'execute_tool',
              'operation.name': 'execute_tool',
              'sentry.op': 'gen_ai.execute_tool',
              'sentry.origin': 'auto.vercelai.otel',
              'vercel.ai.operationId': 'ai.toolCall',
            },
            description: 'execute_tool getWeather',
            op: 'gen_ai.execute_tool',
            origin: 'auto.vercelai.otel',
            status: 'internal_error',
          }),
        ]),

        tags: {
          'test-tag': 'test-value',
        },
      };

      let traceId: string = 'unset-trace-id';
      let spanId: string = 'unset-span-id';

      const expectedError = {
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
          },
        },
        exception: {
          values: expect.arrayContaining([
            expect.objectContaining({
              type: 'AI_ToolExecutionError',
              value: 'Error executing tool getWeather: Error in tool',
            }),
          ]),
        },
        tags: {
          'test-tag': 'test-value',
        },
      };

      await createRunner()
        .expect({
          transaction: transaction => {
            expect(transaction).toMatchObject(expectedTransaction);
            traceId = transaction.contexts!.trace!.trace_id;
            spanId = transaction.contexts!.trace!.span_id;
          },
        })
        .expect({
          event: event => {
            expect(event).toMatchObject(expectedError);
            expect(event.contexts!.trace!.trace_id).toBe(traceId);
            expect(event.contexts!.trace!.span_id).toBe(spanId);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-error-in-tool-express.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures error in tool in express server', async () => {
      const expectedTransaction = {
        transaction: 'GET /test/error-in-tool',
        spans: expect.arrayContaining([
          expect.objectContaining({
            data: {
              'gen_ai.request.model': 'mock-model-id',
              'gen_ai.response.model': 'mock-model-id',
              'gen_ai.usage.input_tokens': 15,
              'gen_ai.usage.output_tokens': 25,
              'gen_ai.usage.total_tokens': 40,
              'gen_ai.operation.name': 'generate_content',
              'operation.name': 'generate_content',
              'sentry.op': 'gen_ai.invoke_agent',
              'sentry.origin': 'auto.vercelai.otel',
              'vercel.ai.model.provider': 'mock-provider',
              'vercel.ai.operationId': 'ai.generateText',
              'vercel.ai.pipeline.name': 'generateText',
              'vercel.ai.settings.maxRetries': 2,
              'vercel.ai.settings.maxSteps': 1,
              'vercel.ai.streaming': false,
            },
            description: 'generateText',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.vercelai.otel',
            status: 'internal_error',
          }),
          expect.objectContaining({
            data: {
              'gen_ai.request.model': 'mock-model-id',
              'gen_ai.response.finish_reasons': ['tool-calls'],
              'gen_ai.response.id': expect.any(String),
              'gen_ai.response.model': 'mock-model-id',
              'gen_ai.system': 'mock-provider',
              'gen_ai.usage.input_tokens': 15,
              'gen_ai.usage.output_tokens': 25,
              'gen_ai.usage.total_tokens': 40,
              'gen_ai.operation.name': 'generate_content',
              'operation.name': 'generate_content',
              'sentry.op': 'gen_ai.generate_text',
              'sentry.origin': 'auto.vercelai.otel',
              'vercel.ai.model.provider': 'mock-provider',
              'vercel.ai.operationId': 'ai.generateText.doGenerate',
              'vercel.ai.pipeline.name': 'generateText.doGenerate',
              'vercel.ai.response.finishReason': 'tool-calls',
              'vercel.ai.response.id': expect.any(String),
              'vercel.ai.response.model': 'mock-model-id',
              'vercel.ai.response.timestamp': expect.any(String),
              'vercel.ai.settings.maxRetries': 2,
              'vercel.ai.streaming': false,
            },
            description: 'generate_text mock-model-id',
            op: 'gen_ai.generate_text',
            origin: 'auto.vercelai.otel',
            status: 'ok',
          }),
          expect.objectContaining({
            data: {
              'gen_ai.tool.call.id': 'call-1',
              'gen_ai.tool.name': 'getWeather',
              'gen_ai.tool.type': 'function',
              'gen_ai.operation.name': 'execute_tool',
              'operation.name': 'execute_tool',
              'sentry.op': 'gen_ai.execute_tool',
              'sentry.origin': 'auto.vercelai.otel',
              'vercel.ai.operationId': 'ai.toolCall',
            },
            description: 'execute_tool getWeather',
            op: 'gen_ai.execute_tool',
            origin: 'auto.vercelai.otel',
            status: 'internal_error',
          }),
        ]),

        tags: {
          'test-tag': 'test-value',
        },
      };

      const expectedError = {
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
          },
        },
        exception: {
          values: expect.arrayContaining([
            expect.objectContaining({
              type: 'AI_ToolExecutionError',
              value: 'Error executing tool getWeather: Error in tool',
            }),
          ]),
        },
        tags: {
          'test-tag': 'test-value',
        },
      };

      let transactionEvent: Event | undefined;
      let errorEvent: Event | undefined;

      const runner = createRunner()
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
        .start();

      await runner.makeRequest('get', '/test/error-in-tool', { expectError: true });
      await runner.completed();

      expect(transactionEvent).toBeDefined();
      expect(errorEvent).toBeDefined();

      expect(transactionEvent).toMatchObject(expectedTransaction);

      expect(errorEvent).toMatchObject(expectedError);
      expect(errorEvent!.contexts!.trace!.trace_id).toBe(transactionEvent!.contexts!.trace!.trace_id);
      expect(errorEvent!.contexts!.trace!.span_id).toBe(transactionEvent!.contexts!.trace!.span_id);
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-late-model-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sets op correctly even when model ID is not available at span start', async () => {
      const expectedTransaction = {
        transaction: 'main',
        spans: expect.arrayContaining([
          // The generateText span should have the correct op even though model ID was not available at span start
          expect.objectContaining({
            description: 'generateText',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.vercelai.otel',
            status: 'ok',
            data: expect.objectContaining({
              'sentry.op': 'gen_ai.invoke_agent',
              'sentry.origin': 'auto.vercelai.otel',
              'gen_ai.operation.name': 'generate_content',
            }),
          }),
          // The doGenerate span - name stays as 'generateText.doGenerate' since model ID is missing
          expect.objectContaining({
            description: 'generateText.doGenerate',
            op: 'gen_ai.generate_text',
            origin: 'auto.vercelai.otel',
            status: 'ok',
            data: expect.objectContaining({
              'sentry.op': 'gen_ai.generate_text',
              'sentry.origin': 'auto.vercelai.otel',
              'gen_ai.operation.name': 'generate_content',
            }),
          }),
        ]),
      };

      await createRunner().expect({ transaction: expectedTransaction }).start().completed();
    });
  });
});
