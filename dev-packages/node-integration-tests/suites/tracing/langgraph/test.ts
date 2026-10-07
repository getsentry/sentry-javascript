import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { getStringAttributeValue } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('LangGraph integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should instrument LangGraph with default PII settings', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'langgraph-test');
            expect(segment).toBeDefined();
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langgraph');
            expect(spans).toHaveLength(2);
            expect(spans.map(span => span.name).sort()).toEqual([
              'invoke_agent weather_assistant',
              'invoke_agent weather_assistant',
            ]);

            const invokeAgentSpans = spans.filter(span => span.name === 'invoke_agent weather_assistant');
            expect(invokeAgentSpans).toHaveLength(2);
            for (const span of invokeAgentSpans) {
              expect(span.status).toBe('ok');
              expect(span.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
              expect(span.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langgraph');
              expect(span.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
              expect(span.attributes[GEN_AI_AGENT_NAME].value).toBe('weather_assistant');
              expect(span.attributes[GEN_AI_PIPELINE_NAME].value).toBe('weather_assistant');
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('should instrument LangGraph with genAI recording enabled', async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'langgraph-test');
            expect(segment).toBeDefined();
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langgraph');
            expect(spans).toHaveLength(2);

            const weatherTodaySpan = spans.find(span =>
              getStringAttributeValue(span.attributes[GEN_AI_INPUT_MESSAGES]?.value)?.includes(
                'What is the weather today?',
              ),
            );
            expect(weatherTodaySpan!.name).toBe('invoke_agent weather_assistant');
            expect(weatherTodaySpan!.status).toBe('ok');
            expect(weatherTodaySpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(weatherTodaySpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langgraph');

            const weatherDetailsSpan = spans.find(span =>
              getStringAttributeValue(span.attributes[GEN_AI_INPUT_MESSAGES]?.value)?.includes(
                'Tell me about the weather',
              ),
            );
            expect(weatherDetailsSpan!.name).toBe('invoke_agent weather_assistant');
            expect(weatherDetailsSpan!.status).toBe('ok');
            expect(weatherDetailsSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-tools.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('should capture tools from LangGraph agent', { timeout: 30000 }, async () => {
      await createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'langgraph-tools-test');
            expect(segment).toBeDefined();
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langgraph');
            expect(spans).toHaveLength(2);
            expect(spans.map(span => span.name).sort()).toEqual([
              'invoke_agent tool_agent',
              'invoke_agent tool_calling_agent',
            ]);

            const toolAgentInvokeSpan = spans.find(span => span.name === 'invoke_agent tool_agent');
            expect(toolAgentInvokeSpan!.status).toBe('ok');
            expect(toolAgentInvokeSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_TOOL_DEFINITIONS].value).toContain('get_weather');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather?');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4-0613');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toContain(
              'Response without calling tools',
            );
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(25);
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(40);

            const toolCallingInvokeSpan = spans.find(span => span.name === 'invoke_agent tool_calling_agent');
            expect(toolCallingInvokeSpan!.status).toBe('ok');
            expect(toolCallingInvokeSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('San Francisco');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4-0613');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toMatch(/"role":"tool"/);
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_RESPONSE_TOOL_CALLS].value).toContain('get_weather');
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(80);
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(40);
            expect(toolCallingInvokeSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(120);
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
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'langgraph-thread-id-test');
            expect(segment).toBeDefined();
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langgraph');
            expect(spans).toHaveLength(3);

            const firstThreadSpan = spans.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'thread_abc123_session_1',
            );
            expect(firstThreadSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(firstThreadSpan!.status).toBe('ok');
            expect(firstThreadSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');

            const secondThreadSpan = spans.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'thread_xyz789_session_2',
            );
            expect(secondThreadSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(secondThreadSpan!.status).toBe('ok');

            const noThreadSpan = spans.find(
              span =>
                span.name === 'invoke_agent thread_test_agent' && span.attributes[GEN_AI_CONVERSATION_ID] === undefined,
            );
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langgraph',
              );
              expect(spans).toHaveLength(1);
              const invokeAgentSpan = spans.find(span => span.name === 'invoke_agent test-agent');

              expect(invokeAgentSpan!.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe(
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
        .expect({
          span: container => {
            const segment = container.items.find(span => span.is_segment && span.name === 'langgraph-resume-test');
            expect(segment?.status).toBe('ok');
            const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.langgraph');
            expect(spans).toHaveLength(2);

            const invokeAgentSpan = spans.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'resume-thread-1',
            );
            expect(invokeAgentSpan!.name).toBe('invoke_agent resume_agent');
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langgraph');
            expect(invokeAgentSpan!.attributes[GEN_AI_AGENT_NAME].value).toBe('resume_agent');
            expect(invokeAgentSpan!.attributes[GEN_AI_PIPELINE_NAME].value).toBe('resume_agent');
          },
        })
        .start()
        .completed();
    });
  });

  // Custom `Annotation.Root` state has no `messages` channel, so the whole state object is recorded on
  // both the input and the output side of the invoke_agent span.
  createEsmAndCjsTests(__dirname, 'scenario-custom-state.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('records custom Annotation.Root state as input and output on the invoke_agent span', async () => {
      await createRunner()
        .expect({
          span: container => {
            const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent custom_state_agent');
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes[SENTRY_OP].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.langgraph');

            const inputMessages = getStringAttributeValue(invokeAgentSpan!.attributes[GEN_AI_INPUT_MESSAGES]?.value);
            expect(inputMessages).toContain('"role":"user"');
            expect(inputMessages).toContain('weather');

            const outputMessages = getStringAttributeValue(invokeAgentSpan!.attributes[GEN_AI_OUTPUT_MESSAGES]?.value);
            expect(outputMessages).toContain('"role":"assistant"');
            expect(outputMessages).toContain('Summary of weather');
          },
        })
        .start()
        .completed();
    });
  });

  // createReactAgent tests.
  // Spans are asserted order-independently: the span-array order is not a protocol guarantee (Sentry
  // rebuilds the tree from `parent_span_id`), and the provider emits tree order while the OTel exporter
  // emits finish order (the `http.client` that the chat span wraps finishes before the chat span itself).
  createEsmAndCjsTests(__dirname, 'agent-scenario.mjs', 'instrument-agent.mjs', (createRunner, test) => {
    test('should instrument createReactAgent with agent and chat spans', { timeout: 30000 }, async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            expect(container.items.find(span => span.attributes[SENTRY_OP]?.value === 'http.client')).toBeDefined();
            const spans = container.items;
            expect(spans).toContainEqual(
              expect.objectContaining({
                name: 'invoke_agent helpful_assistant',
                status: 'ok',
                attributes: expect.objectContaining({
                  [GEN_AI_OPERATION_NAME]: expect.objectContaining({ value: 'invoke_agent' }),
                  [SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.invoke_agent' }),
                  [SENTRY_ORIGIN]: expect.objectContaining({ value: 'auto.ai.langgraph' }),
                  [GEN_AI_AGENT_NAME]: expect.objectContaining({ value: 'helpful_assistant' }),
                  [GEN_AI_PIPELINE_NAME]: expect.objectContaining({ value: 'helpful_assistant' }),
                }),
              }),
            );
            expect(spans).toContainEqual(
              expect.objectContaining({
                attributes: expect.objectContaining({
                  [SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.chat' }),
                  [GEN_AI_AGENT_NAME]: expect.objectContaining({ value: 'helpful_assistant' }),
                }),
              }),
            );
          },
        })
        .start()
        .completed();
    });
  });

  // createReactAgent with tools - verifies tool execution spans (asserted order-independently, see above).
  createEsmAndCjsTests(__dirname, 'agent-tools-scenario.mjs', 'instrument-agent.mjs', (createRunner, test) => {
    test('should create tool execution spans for createReactAgent with tools', { timeout: 30000 }, async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            expect(container.items.filter(span => span.attributes[SENTRY_OP]?.value === 'http.client')).toHaveLength(3);
            const spans = container.items;
            expect(spans).toContainEqual(
              expect.objectContaining({
                status: 'ok',
                attributes: expect.objectContaining({
                  [SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.invoke_agent' }),
                  [GEN_AI_OPERATION_NAME]: expect.objectContaining({ value: 'invoke_agent' }),
                  [GEN_AI_AGENT_NAME]: expect.objectContaining({ value: 'math_assistant' }),
                }),
              }),
            );
            expect(spans).toContainEqual(
              expect.objectContaining({
                name: 'execute_tool add',
                status: 'ok',
                attributes: expect.objectContaining({
                  [SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.execute_tool' }),
                  [GEN_AI_OPERATION_NAME]: expect.objectContaining({ value: 'execute_tool' }),
                  [GEN_AI_TOOL_NAME]: expect.objectContaining({ value: 'add' }),
                }),
              }),
            );
            expect(spans).toContainEqual(
              expect.objectContaining({
                name: 'execute_tool multiply',
                status: 'ok',
                attributes: expect.objectContaining({
                  [SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.execute_tool' }),
                  [GEN_AI_OPERATION_NAME]: expect.objectContaining({ value: 'execute_tool' }),
                  [GEN_AI_TOOL_NAME]: expect.objectContaining({ value: 'multiply' }),
                }),
              }),
            );
            expect(spans.filter(span => span.attributes[SENTRY_OP]?.value === 'gen_ai.chat')).toHaveLength(3);

            // `thread_id` reaches the agent span and every chat and tool span under it.
            const genAiSpans = spans.filter(span => String(span.attributes[SENTRY_OP]?.value).startsWith('gen_ai.'));
            expect(genAiSpans).toHaveLength(6);
            for (const span of genAiSpans) {
              expect(span.attributes[GEN_AI_CONVERSATION_ID]?.value).toBe('math_thread');
            }
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-stategraph-chat.mjs', 'instrument-agent.mjs', (createRunner, test) => {
    test('auto-injects langchain handler for plain StateGraph and emits chat spans', { timeout: 30000 }, async () => {
      await createRunner()
        .expect({
          span: container => {
            expect(container.items.find(span => span.is_segment && span.name === 'main')).toBeDefined();
            const chatSpans = container.items.filter(s => s.attributes[SENTRY_OP]?.value === 'gen_ai.chat');
            expect(chatSpans).toHaveLength(1);
            expect(chatSpans[0]?.attributes[GEN_AI_AGENT_NAME]?.value).toBe('plain_assistant');
          },
        })
        .start()
        .completed();
    });
  });
});
