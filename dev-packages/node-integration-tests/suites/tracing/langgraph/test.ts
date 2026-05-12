import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PIPELINE_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('LangGraph integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should instrument LangGraph with default PII settings', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            expect(container.items.map(span => span.name).sort()).toEqual([
              'create_agent weather_assistant',
              'invoke_agent weather_assistant',
              'invoke_agent weather_assistant',
            ]);

            const createAgentSpan = container.items.find(span => span.name === 'create_agent weather_assistant');
            expect(createAgentSpan).toBeDefined();
            expect(createAgentSpan!.status).toBe('ok');
            expect(createAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(createAgentSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(createAgentSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('create_agent');
            expect(createAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('weather_assistant');

            const invokeAgentSpans = container.items.filter(span => span.name === 'invoke_agent weather_assistant');
            expect(invokeAgentSpans).toHaveLength(2);
            for (const span of invokeAgentSpans) {
              expect(span.status).toBe('ok');
              expect(span.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(span.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
              expect(span.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('invoke_agent');
              expect(span.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('weather_assistant');
              expect(span.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE].value).toBe('weather_assistant');
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('should instrument LangGraph with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const createAgentSpan = container.items.find(span => span.name === 'create_agent weather_assistant');
            expect(createAgentSpan).toBeDefined();
            expect(createAgentSpan!.status).toBe('ok');
            expect(createAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');

            const weatherTodaySpan = container.items.find(span =>
              span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes('What is the weather today?'),
            );
            expect(weatherTodaySpan).toBeDefined();
            expect(weatherTodaySpan!.name).toBe('invoke_agent weather_assistant');
            expect(weatherTodaySpan!.status).toBe('ok');
            expect(weatherTodaySpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(weatherTodaySpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');

            const weatherDetailsSpan = container.items.find(span =>
              span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes('Tell me about the weather'),
            );
            expect(weatherDetailsSpan).toBeDefined();
            expect(weatherDetailsSpan!.name).toBe('invoke_agent weather_assistant');
            expect(weatherDetailsSpan!.status).toBe('ok');
            expect(weatherDetailsSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('should capture tools from LangGraph agent', { timeout: 30000 }, async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-tools-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            expect(container.items.map(span => span.name).sort()).toEqual([
              'create_agent tool_agent',
              'create_agent tool_calling_agent',
              'invoke_agent tool_agent',
              'invoke_agent tool_calling_agent',
            ]);

            const toolAgentSpan = container.items.find(span => span.name === 'create_agent tool_agent');
            expect(toolAgentSpan).toBeDefined();
            expect(toolAgentSpan!.status).toBe('ok');
            expect(toolAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(toolAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('tool_agent');

            const toolAgentInvokeSpan = container.items.find(span => span.name === 'invoke_agent tool_agent');
            expect(toolAgentInvokeSpan).toBeDefined();
            expect(toolAgentInvokeSpan!.status).toBe('ok');
            expect(toolAgentInvokeSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toContain(
              'get_weather',
            );
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'What is the weather?',
            );
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gpt-4-0613');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toContain(
              'Response without calling tools',
            );
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(40);

            const toolCallingAgentSpan = container.items.find(span => span.name === 'create_agent tool_calling_agent');
            expect(toolCallingAgentSpan).toBeDefined();
            expect(toolCallingAgentSpan!.status).toBe('ok');
            expect(toolCallingAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(toolCallingAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('tool_calling_agent');

            const toolCallingInvokeSpan = container.items.find(span => span.name === 'invoke_agent tool_calling_agent');
            expect(toolCallingInvokeSpan).toBeDefined();
            expect(toolCallingInvokeSpan!.status).toBe('ok');
            expect(toolCallingInvokeSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain('San Francisco');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gpt-4-0613');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toMatch(/"role":"tool"/);
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toContain(
              'get_weather',
            );
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(80);
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(40);
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(120);
          },
        })
        .start()
        .completed();
    });
  });

  // Test for thread_id (conversation ID) support
  createEsmAndCjsTests(__dirname, 'scenario-thread-id.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should capture thread_id as gen_ai.conversation.id', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-thread-id-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(4);
            const createAgentSpan = container.items.find(span => span.name === 'create_agent thread_test_agent');
            expect(createAgentSpan).toBeDefined();
            expect(createAgentSpan!.status).toBe('ok');
            expect(createAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');

            const firstThreadSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value === 'thread_abc123_session_1',
            );
            expect(firstThreadSpan).toBeDefined();
            expect(firstThreadSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(firstThreadSpan!.status).toBe('ok');
            expect(firstThreadSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

            const secondThreadSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value === 'thread_xyz789_session_2',
            );
            expect(secondThreadSpan).toBeDefined();
            expect(secondThreadSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(secondThreadSpan!.status).toBe('ok');

            const noThreadSpan = container.items.find(
              span =>
                span.name === 'invoke_agent thread_test_agent' &&
                span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE] === undefined,
            );
            expect(noThreadSpan).toBeDefined();
            expect(noThreadSpan!.status).toBe('ok');
          },
        })
        .start()
        .completed();
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
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              expect(container.items).toHaveLength(2);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent test-agent');

              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(
                JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }]),
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  // Test for null input resume scenario
  createEsmAndCjsTests(__dirname, 'scenario-resume.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should not throw when invoke is called with null input (resume scenario)', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'langgraph-resume-test',
            contexts: {
              trace: expect.objectContaining({
                status: 'ok',
              }),
            },
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);
            const createAgentSpan = container.items.find(span => span.name === 'create_agent resume_agent');
            expect(createAgentSpan).toBeDefined();
            expect(createAgentSpan!.status).toBe('ok');
            expect(createAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(createAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('resume_agent');

            const invokeAgentSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value === 'resume-thread-1',
            );
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.name).toBe('invoke_agent resume_agent');
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(invokeAgentSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('resume_agent');
            expect(invokeAgentSpan!.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE].value).toBe('resume_agent');
          },
        })
        .start()
        .completed();
    });
  });

  const longContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(
    __dirname,
    'scenario-no-truncation.mjs',
    'instrument-no-truncation.mjs',
    (createRunner, test) => {
      test('does not truncate input messages when enableTruncation is false', async () => {
        await createRunner()
          .ignore('event')
          .expect({ transaction: { transaction: 'langgraph-test' } })
          .expect({
            span: container => {
              const expectedMessages = JSON.stringify([
                { role: 'user', content: longContent },
                { role: 'assistant', content: 'Some reply' },
                { role: 'user', content: 'Follow-up question' },
              ]);

              expect(container.items).toHaveLength(2);
              const invokeAgentSpan = container.items.find(
                span => span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value === expectedMessages,
              );

              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.name).toBe('invoke_agent weather_assistant');
              expect(invokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
            },
          })
          .start()
          .completed();
      });
    },
  );

  const streamingLongContent = 'A'.repeat(50_000);

  createEsmAndCjsTests(__dirname, 'scenario-span-streaming.mjs', 'instrument-streaming.mjs', (createRunner, test) => {
    test('automatically disables truncation when span streaming is enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const spans = container.items;

            const chatSpan = spans.find(s =>
              s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.includes(streamingLongContent),
            );
            expect(chatSpan).toBeDefined();
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-span-streaming.mjs',
    'instrument-streaming-with-truncation.mjs',
    (createRunner, test) => {
      test('respects explicit enableTruncation: true even when span streaming is enabled', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items;

              // With explicit enableTruncation: true, content should be truncated despite streaming.
              const chatSpan = spans.find(s =>
                s.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value?.startsWith('[{"role":"user","content":"AAAA'),
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value.length).toBeLessThan(
                streamingLongContent.length,
              );
            },
          })
          .start()
          .completed();
      });
    },
  );

  // createReactAgent tests
  const EXPECTED_TRANSACTION_REACT_AGENT = {
    transaction: 'main',
    spans: [
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langgraph',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'helpful_assistant',
          [GEN_AI_PIPELINE_NAME_ATTRIBUTE]: 'helpful_assistant',
        }),
        description: 'invoke_agent helpful_assistant',
        op: 'gen_ai.invoke_agent',
        origin: 'auto.ai.langgraph',
        status: 'ok',
      }),
      expect.objectContaining({ op: 'http.client' }),
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'helpful_assistant',
        }),
        op: 'gen_ai.chat',
      }),
    ],
  };

  createEsmAndCjsTests(__dirname, 'agent-scenario.mjs', 'instrument-agent.mjs', (createRunner, test) => {
    test('should instrument createReactAgent with agent and chat spans', { timeout: 30000 }, async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_REACT_AGENT })
        .start()
        .completed();
    });
  });

  // createReactAgent with tools - verifies tool execution spans
  const EXPECTED_TRANSACTION_REACT_AGENT_TOOLS = {
    transaction: 'main',
    spans: [
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
          [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'math_assistant',
        }),
        op: 'gen_ai.invoke_agent',
        status: 'ok',
      }),
      expect.objectContaining({ op: 'http.client' }),
      expect.objectContaining({ op: 'gen_ai.chat' }),
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'add',
          'gen_ai.tool.type': 'function',
        }),
        description: 'execute_tool add',
        op: 'gen_ai.execute_tool',
        status: 'ok',
      }),
      expect.objectContaining({ op: 'http.client' }),
      expect.objectContaining({ op: 'gen_ai.chat' }),
      expect.objectContaining({
        data: expect.objectContaining({
          [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
          [GEN_AI_TOOL_NAME_ATTRIBUTE]: 'multiply',
          'gen_ai.tool.type': 'function',
        }),
        description: 'execute_tool multiply',
        op: 'gen_ai.execute_tool',
        status: 'ok',
      }),
      expect.objectContaining({ op: 'http.client' }),
      expect.objectContaining({ op: 'gen_ai.chat' }),
    ],
  };

  createEsmAndCjsTests(__dirname, 'agent-tools-scenario.mjs', 'instrument-agent.mjs', (createRunner, test) => {
    test('should create tool execution spans for createReactAgent with tools', { timeout: 30000 }, async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_REACT_AGENT_TOOLS })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stategraph-chat.mjs', 'instrument-agent.mjs', (createRunner, test) => {
    test('auto-injects langchain handler for plain StateGraph and emits chat spans', { timeout: 30000 }, async () => {
      await createRunner()
        .ignore('event')
        .expect({
          transaction: event => {
            const spans = event.spans ?? [];
            const chatSpans = spans.filter(s => s.op === 'gen_ai.chat');
            expect(chatSpans).toHaveLength(1);
            expect(chatSpans[0]?.data).toMatchObject({
              [GEN_AI_AGENT_NAME_ATTRIBUTE]: 'plain_assistant',
            });
          },
        })
        .start()
        .completed();
    });
  });
});
