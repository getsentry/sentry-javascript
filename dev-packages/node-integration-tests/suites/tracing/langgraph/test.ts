import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
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
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            expect(container.items.map(span => span.name).sort()).toEqual([
              'invoke_agent weather_assistant',
              'invoke_agent weather_assistant',
            ]);

            const invokeAgentSpans = container.items.filter(span => span.name === 'invoke_agent weather_assistant');
            expect(invokeAgentSpans).toHaveLength(2);
            for (const span of invokeAgentSpans) {
              expect(span.status).toBe('ok');
              expect(span.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(span.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
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
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);

            const weatherTodaySpan = container.items.find(span =>
              getStringAttributeValue(span.attributes[GEN_AI_INPUT_MESSAGES]?.value)?.includes(
                'What is the weather today?',
              ),
            );
            expect(weatherTodaySpan).toBeDefined();
            expect(weatherTodaySpan!.name).toBe('invoke_agent weather_assistant');
            expect(weatherTodaySpan!.status).toBe('ok');
            expect(weatherTodaySpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(weatherTodaySpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');

            const weatherDetailsSpan = container.items.find(span =>
              getStringAttributeValue(span.attributes[GEN_AI_INPUT_MESSAGES]?.value)?.includes(
                'Tell me about the weather',
              ),
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
            expect(container.items).toHaveLength(2);
            expect(container.items.map(span => span.name).sort()).toEqual([
              'invoke_agent tool_agent',
              'invoke_agent tool_calling_agent',
            ]);

            const toolAgentInvokeSpan = container.items.find(span => span.name === 'invoke_agent tool_agent');
            expect(toolAgentInvokeSpan).toBeDefined();
            expect(toolAgentInvokeSpan!.status).toBe('ok');
            expect(toolAgentInvokeSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_TOOL_DEFINITIONS].value).toContain('get_weather');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather?');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4-0613');
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_RESPONSE_TEXT].value).toContain(
              'Response without calling tools',
            );
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(25);
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(15);
            expect(toolAgentInvokeSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(40);

            const toolCallingInvokeSpan = container.items.find(span => span.name === 'invoke_agent tool_calling_agent');
            expect(toolCallingInvokeSpan).toBeDefined();
            expect(toolCallingInvokeSpan!.status).toBe('ok');
            expect(toolCallingInvokeSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
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
        .ignore('event')
        .expect({ transaction: { transaction: 'langgraph-thread-id-test' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(3);

            const firstThreadSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'thread_abc123_session_1',
            );
            expect(firstThreadSpan).toBeDefined();
            expect(firstThreadSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(firstThreadSpan!.status).toBe('ok');
            expect(firstThreadSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');

            const secondThreadSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'thread_xyz789_session_2',
            );
            expect(secondThreadSpan).toBeDefined();
            expect(secondThreadSpan!.name).toBe('invoke_agent thread_test_agent');
            expect(secondThreadSpan!.status).toBe('ok');

            const noThreadSpan = container.items.find(
              span =>
                span.name === 'invoke_agent thread_test_agent' && span.attributes[GEN_AI_CONVERSATION_ID] === undefined,
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
              expect(container.items).toHaveLength(1);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent test-agent');

              expect(invokeAgentSpan).toBeDefined();
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
            expect(container.items).toHaveLength(2);

            const invokeAgentSpan = container.items.find(
              span => span.attributes[GEN_AI_CONVERSATION_ID]?.value === 'resume-thread-1',
            );
            expect(invokeAgentSpan).toBeDefined();
            expect(invokeAgentSpan!.name).toBe('invoke_agent resume_agent');
            expect(invokeAgentSpan!.status).toBe('ok');
            expect(invokeAgentSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(invokeAgentSpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
            expect(invokeAgentSpan!.attributes[GEN_AI_AGENT_NAME].value).toBe('resume_agent');
            expect(invokeAgentSpan!.attributes[GEN_AI_PIPELINE_NAME].value).toBe('resume_agent');
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-span-streaming.mjs', (createRunner, test) => {
    test('creates langgraph related spans with span streaming enabled', async () => {
      await createRunner()
        .ignore('event')
        .expect({
          span: container => {
            const weatherTodaySpan = container.items.find(span =>
              getStringAttributeValue(span.attributes[GEN_AI_INPUT_MESSAGES]?.value)?.includes(
                'What is the weather today?',
              ),
            );
            expect(weatherTodaySpan).toBeDefined();
            expect(weatherTodaySpan!.name).toBe('invoke_agent weather_assistant');
            expect(weatherTodaySpan!.status).toBe('ok');
            expect(weatherTodaySpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(weatherTodaySpan!.attributes['sentry.origin'].value).toBe('auto.ai.langgraph');
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
        .ignore('event')
        .expect({
          transaction: event => {
            const spans = event.spans ?? [];
            expect(event.transaction).toBe('main');
            expect(spans).toContainEqual(expect.objectContaining({ op: 'http.client' }));
          },
        })
        .expect({
          span: container => {
            const spans = container.items;
            expect(spans).toContainEqual(
              expect.objectContaining({
                name: 'invoke_agent helpful_assistant',
                status: 'ok',
                attributes: expect.objectContaining({
                  [GEN_AI_OPERATION_NAME]: expect.objectContaining({ value: 'invoke_agent' }),
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.invoke_agent' }),
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: expect.objectContaining({ value: 'auto.ai.langgraph' }),
                  [GEN_AI_AGENT_NAME]: expect.objectContaining({ value: 'helpful_assistant' }),
                  [GEN_AI_PIPELINE_NAME]: expect.objectContaining({ value: 'helpful_assistant' }),
                }),
              }),
            );
            expect(spans).toContainEqual(
              expect.objectContaining({
                attributes: expect.objectContaining({
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.chat' }),
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
        .ignore('event')
        .expect({
          transaction: event => {
            const spans = event.spans ?? [];
            expect(event.transaction).toBe('main');
            expect(spans.filter(span => span.op === 'http.client')).toHaveLength(3);
          },
        })
        .expect({
          span: container => {
            const spans = container.items;
            expect(spans).toContainEqual(
              expect.objectContaining({
                status: 'ok',
                attributes: expect.objectContaining({
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.invoke_agent' }),
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
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.execute_tool' }),
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
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: expect.objectContaining({ value: 'gen_ai.execute_tool' }),
                  [GEN_AI_OPERATION_NAME]: expect.objectContaining({ value: 'execute_tool' }),
                  [GEN_AI_TOOL_NAME]: expect.objectContaining({ value: 'multiply' }),
                }),
              }),
            );
            expect(
              spans.filter(span => span.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'gen_ai.chat'),
            ).toHaveLength(3);
          },
        })
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
            expect(event.transaction).toBe('main');
          },
        })
        .expect({
          span: container => {
            const chatSpans = container.items.filter(
              s => s.attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === 'gen_ai.chat',
            );
            expect(chatSpans).toHaveLength(1);
            expect(chatSpans[0]?.attributes[GEN_AI_AGENT_NAME]?.value).toBe('plain_assistant');
          },
        })
        .start()
        .completed();
    });
  });
});
