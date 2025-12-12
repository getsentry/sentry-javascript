import { afterAll, describe, expect } from 'vitest';
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
          'gen_ai.operation.name': 'create_agent',
          'sentry.op': 'gen_ai.create_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
        },
        description: 'create_agent weather_assistant',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // First invoke_agent span
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
          'gen_ai.pipeline.name': 'weather_assistant',
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // Second invoke_agent span
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
          'gen_ai.pipeline.name': 'weather_assistant',
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
          'gen_ai.operation.name': 'create_agent',
          'sentry.op': 'gen_ai.create_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
        },
        description: 'create_agent weather_assistant',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // First invoke_agent span with PII
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
          'gen_ai.pipeline.name': 'weather_assistant',
          'gen_ai.request.messages': expect.stringContaining('What is the weather today?'),
        }),
        description: 'invoke_agent weather_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // Second invoke_agent span with PII and multiple messages
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'weather_assistant',
          'gen_ai.pipeline.name': 'weather_assistant',
          'gen_ai.request.messages': expect.stringContaining('Tell me about the weather'),
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
          'gen_ai.operation.name': 'create_agent',
          'sentry.op': 'gen_ai.create_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'tool_agent',
        },
        description: 'create_agent tool_agent',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // invoke_agent span with tools available but not called
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'tool_agent',
          'gen_ai.pipeline.name': 'tool_agent',
          'gen_ai.request.available_tools': expect.stringContaining('get_weather'),
          'gen_ai.request.messages': expect.stringContaining('What is the weather?'),
          'gen_ai.response.model': 'gpt-4-0613',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.text': expect.stringContaining('Response without calling tools'),
          'gen_ai.usage.input_tokens': 25,
          'gen_ai.usage.output_tokens': 15,
          'gen_ai.usage.total_tokens': 40,
        }),
        description: 'invoke_agent tool_agent',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // create_agent span for second graph (with tool calls)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'create_agent',
          'sentry.op': 'gen_ai.create_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'tool_calling_agent',
        },
        description: 'create_agent tool_calling_agent',
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // invoke_agent span with tool calls and execution
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
          'gen_ai.agent.name': 'tool_calling_agent',
          'gen_ai.pipeline.name': 'tool_calling_agent',
          'gen_ai.request.available_tools': expect.stringContaining('get_weather'),
          'gen_ai.request.messages': expect.stringContaining('San Francisco'),
          'gen_ai.response.model': 'gpt-4-0613',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.text': expect.stringMatching(/"role":"tool"/),
          // Verify tool_calls are captured
          'gen_ai.response.tool_calls': expect.stringContaining('get_weather'),
          'gen_ai.usage.input_tokens': 80,
          'gen_ai.usage.output_tokens': 40,
          'gen_ai.usage.total_tokens': 120,
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

  const EXPECTED_TRANSACTION_REACT_AGENT = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // create_agent span
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'create_agent',
          'sentry.op': 'gen_ai.create_agent',
          'sentry.origin': 'auto.ai.langgraph',
        }),
        description: expect.stringContaining('create_agent'),
        op: 'gen_ai.create_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      // invoke_agent span
      expect.objectContaining({
        data: expect.objectContaining({
          'gen_ai.operation.name': 'invoke_agent',
          'sentry.op': 'gen_ai.invoke_agent',
          'sentry.origin': 'auto.ai.langgraph',
        }),
        description: expect.stringContaining('invoke_agent'),
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'agent-scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should instrument LangGraph createReactAgent with default PII settings', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_REACT_AGENT })
        .start()
        .completed();
    });
  });
});
