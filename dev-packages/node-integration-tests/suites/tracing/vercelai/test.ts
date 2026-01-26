import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PROMPT_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
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
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['stop'],
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_PROMPT_ATTRIBUTE]: '{"prompt":"Where is the second span?"}',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"Where is the second span?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String),
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['stop'],
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String),
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['tool-calls'],
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'call-1',
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'getWeather',
          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: 'function',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_PROMPT_ATTRIBUTE]: '{"prompt":"Where is the first span?"}',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"Where is the first span?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'First span here!',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]:
            '[{"role":"user","content":[{"type":"text","text":"Where is the first span?"}]}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['stop'],
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'First span here!',
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_PROMPT_ATTRIBUTE]: '{"prompt":"Where is the second span?"}',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"Where is the second span?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String),
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['stop'],
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.any(String),
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 10,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 20,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 30,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_PROMPT_ATTRIBUTE]: '{"prompt":"What is the weather in San Francisco?"}',
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: '[{"role":"user","content":"What is the weather in San Francisco?"}]',
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Tool call completed!',
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: expect.any(String),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: EXPECTED_AVAILABLE_TOOLS_JSON,
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.any(String),
          [GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE]: 1,
          [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['tool-calls'],
          [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: 'Tool call completed!',
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: expect.any(String),
          [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
          [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'call-1',
          [GEN_AI_TOOL_INPUT_ATTRIBUTE]: expect.any(String),
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'getWeather',
          [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]: expect.any(String),
          [GEN_AI_TOOL_TYPE_ATTRIBUTE]: 'function',
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['tool-calls'],
              [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'call-1',
              [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'getWeather',
              [GEN_AI_TOOL_TYPE_ATTRIBUTE]: 'function',
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['tool-calls'],
              [GEN_AI_RESPONSE_ID_ATTRIBUTE]: expect.any(String),
              [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'mock-model-id',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'mock-provider',
              [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 15,
              [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 25,
              [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: 'call-1',
              [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'getWeather',
              [GEN_AI_TOOL_TYPE_ATTRIBUTE]: 'function',
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
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
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
            }),
          }),
          // The doGenerate span - name stays as 'generateText.doGenerate' since model ID is missing
          expect.objectContaining({
            description: 'generateText.doGenerate',
            op: 'gen_ai.generate_text',
            origin: 'auto.vercelai.otel',
            status: 'ok',
            data: expect.objectContaining({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_text',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.vercelai.otel',
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'generate_content',
            }),
          }),
        ]),
      };

      await createRunner().expect({ transaction: expectedTransaction }).start().completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-system-instructions.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('extracts system instructions from messages', async () => {
        await createRunner()
          .ignore('event')
          .expect({
            transaction: {
              transaction: 'main',
              spans: expect.arrayContaining([
                expect.objectContaining({
                  data: expect.objectContaining({
                    [GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]: JSON.stringify([
                      { type: 'text', content: 'You are a helpful assistant' },
                    ]),
                  }),
                }),
              ]),
            },
          })
          .start()
          .completed();
      });
    },
  );
});
