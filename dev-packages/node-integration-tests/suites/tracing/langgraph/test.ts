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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] create_agent
            expect(firstSpan!.name).toBe('create_agent weather_assistant');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(firstSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('create_agent');
            expect(firstSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('weather_assistant');

            // [1] first invoke_agent
            expect(secondSpan!.name).toBe('invoke_agent weather_assistant');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(secondSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('invoke_agent');
            expect(secondSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('weather_assistant');
            expect(secondSpan!.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE].value).toBe('weather_assistant');

            // [2] second invoke_agent
            expect(thirdSpan!.name).toBe('invoke_agent weather_assistant');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(thirdSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(thirdSpan!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE].value).toBe('invoke_agent');
            expect(thirdSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('weather_assistant');
            expect(thirdSpan!.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE].value).toBe('weather_assistant');
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
            const [firstSpan, secondSpan, thirdSpan] = container.items;

            // [0] create_agent
            expect(firstSpan!.name).toBe('create_agent weather_assistant');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');

            // [1] first invoke_agent with PII ("What is the weather today?")
            expect(secondSpan!.name).toBe('invoke_agent weather_assistant');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'What is the weather today?',
            );

            // [2] second invoke_agent with PII ("Tell me about the weather")
            expect(thirdSpan!.name).toBe('invoke_agent weather_assistant');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(thirdSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain(
              'Tell me about the weather',
            );
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] create_agent tool_agent
            expect(firstSpan!.name).toBe('create_agent tool_agent');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(firstSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('tool_agent');

            // [1] invoke_agent tool_agent (tools available, not called)
            expect(secondSpan!.name).toBe('invoke_agent tool_agent');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondSpan!.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE].value).toContain('get_weather');
            expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain('What is the weather?');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gpt-4-0613');
            expect(secondSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toContain(
              'Response without calling tools',
            );
            expect(secondSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(25);
            expect(secondSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(15);
            expect(secondSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(40);

            // [2] create_agent tool_calling_agent
            expect(thirdSpan!.name).toBe('create_agent tool_calling_agent');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(thirdSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('tool_calling_agent');

            // [3] invoke_agent tool_calling_agent (with tool calls)
            expect(fourthSpan!.name).toBe('invoke_agent tool_calling_agent');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(fourthSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toContain('San Francisco');
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE].value).toBe('gpt-4-0613');
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_TEXT_ATTRIBUTE].value).toMatch(/"role":"tool"/);
            expect(fourthSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE].value).toContain('get_weather');
            expect(fourthSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE].value).toBe(80);
            expect(fourthSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE].value).toBe(40);
            expect(fourthSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE].value).toBe(120);
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
            const [firstSpan, secondSpan, thirdSpan, fourthSpan] = container.items;

            // [0] create_agent
            expect(firstSpan!.name).toBe('create_agent thread_test_agent');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');

            // [1] first invoke_agent with thread_abc123_session_1
            expect(secondSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE].value).toBe('thread_abc123_session_1');

            // [2] second invoke_agent with thread_xyz789_session_2
            expect(thirdSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(thirdSpan!.status).toBe('ok');
            expect(thirdSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE].value).toBe('thread_xyz789_session_2');

            // [3] third invoke_agent without thread_id
            expect(fourthSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(fourthSpan!.status).toBe('ok');
            expect(fourthSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]).toBeUndefined();
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
              const [, secondSpan] = container.items;

              // [1] invoke_agent with system instructions
              expect(secondSpan!.name).toBe('invoke_agent test-agent');
              expect(secondSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE].value).toBe(
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
            const [firstSpan, secondSpan] = container.items;

            // [0] create_agent resume_agent
            expect(firstSpan!.name).toBe('create_agent resume_agent');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.create_agent');
            expect(firstSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('resume_agent');

            // [1] first invoke_agent with thread_id 'resume-thread-1'
            expect(secondSpan!.name).toBe('invoke_agent resume_agent');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(secondSpan!.attributes[GEN_AI_AGENT_NAME_ATTRIBUTE].value).toBe('resume_agent');
            expect(secondSpan!.attributes[GEN_AI_PIPELINE_NAME_ATTRIBUTE].value).toBe('resume_agent');
            expect(secondSpan!.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE].value).toBe('resume-thread-1');
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
              const [, secondSpan] = container.items;

              // [1] invoke_agent with untruncated input
              expect(secondSpan!.name).toBe('invoke_agent weather_assistant');
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE].value).toBe(expectedMessages);
              expect(secondSpan!.attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE].value).toBe(3);
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
