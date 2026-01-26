import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PIPELINE_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('LangGraph integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'langgraph-test',
    spans: expect.arrayContaining([
      // create_agent span
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
        },
        description: 'create_agent weather_assistant',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // First invoke_agent span
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'weather_assistant',
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // Second invoke_agent span
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'weather_assistant',
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'langgraph-test',
    spans: expect.arrayContaining([
      // create_agent span (PII enabled doesn't affect this span)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
        },
        description: 'create_agent weather_assistant',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // First invoke_agent span with PII
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringContaining('What is the weather today?'),
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // Second invoke_agent span with PII and multiple messages
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'weather_assistant',
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringContaining('Tell me about the weather'),
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_WITH_TOOLS = {
    transaction: 'langgraph-tools-test',
    spans: expect.arrayContaining([
      // create_agent span for first graph (no tool calls)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'tool_agent',
        },
        description: 'create_agent tool_agent',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // invoke_agent span with tools available but not called
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'tool_agent',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'tool_agent',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: expect.stringContaining('get_weather'),
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringContaining('What is the weather?'),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4-0613',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['stop'],
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.stringContaining('Response without calling tools'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 25,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 15,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 40,
        }),
        description: 'invoke_agent tool_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // create_agent span for second graph (with tool calls)
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'tool_calling_agent',
        },
        description: 'create_agent tool_calling_agent',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // invoke_agent span with tool calls and execution
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'tool_calling_agent',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'tool_calling_agent',
          [GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]: expect.stringContaining('get_weather'),
          [GEN_AI_INPUT_MESSAGES_ATTRIBUTE]: expect.stringContaining('San Francisco'),
          [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: 'gpt-4-0613',
          [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: ['stop'],
          [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: expect.stringMatching(/"role":"tool"/),
          // Verify tool_calls are captured
          [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: expect.stringContaining('get_weather'),
          [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: 80,
          [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: 40,
          [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: 120,
        }),
        description: 'invoke_agent tool_calling_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should instrument LangGraph with default PII settings', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('should instrument LangGraph with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('should capture tools from LangGraph agent', { timeout: 30000 }, async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_WITH_TOOLS }).start().completed();
    });
  });

  // Test for thread_id (conversation ID) support
  const EXPECTED_TRANSACTION_THREAD_ID = {
    transaction: 'langgraph-thread-id-test',
    spans: expect.arrayContaining([
      // create_agent span
      expect.objectContaining({
        data: {
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.create_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'thread_test_agent',
        },
        description: 'create_agent thread_test_agent',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // First invoke_agent span with thread_id
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'thread_test_agent',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'thread_test_agent',
          // The thread_id should be captured as conversation.id
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: 'thread_abc123_session_1',
        }),
        description: 'invoke_agent thread_test_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // Second invoke_agent span with different thread_id
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'thread_test_agent',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'thread_test_agent',
          // Different thread_id for different conversation
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: 'thread_xyz789_session_2',
        }),
        description: 'invoke_agent thread_test_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // Third invoke_agent span without thread_id (should NOT have gen_ai.conversation.id)
      expect.objectContaining({
        data: expect.not.objectContaining({
          [GEN_AI_CONVERSATION_ID_ATTRIBUTE]: expect.anything(),
        }),
        description: 'invoke_agent thread_test_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-thread-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should capture thread_id as gen_ai.conversation.id', async () => {
      await createRunner().ignore('event').expect({ transaction: EXPECTED_TRANSACTION_THREAD_ID }).start().completed();
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
