import { NODE_VERSION, type Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { cleanupChildProcesses, createEsmAndCjsTests, createEsmTests } from '../../../../utils/runner';
import { isOrchestrionEnabled } from '../../../../utils';

// On Node 18, we only test v6 as v7 is not supported
const matrix =
  NODE_VERSION.major === 18
    ? ([['6', '^6.0.0']] as const)
    : ([
        ['6', '^6.0.0'],
        ['7', '^7.0.0'],
      ] as const);

describe.each(matrix)('Vercel AI integration (version %s)', (version, vercelAiVersion) => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const usesChannels = version === '7' || isOrchestrionEnabled();

  // in v7 and orchestrion mode, we use the channel-based integration
  // else, we use the OTel processor
  const expectedOrigin = usesChannels ? 'auto.vercelai.channel' : 'auto.vercelai.otel';

  // We only run this in ESM and CJS to verify full support
  // Other suites we only run in ESM to simplify the test setup
  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates ai spans for dataCollection defaults', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the first span?"}]',
              )!;
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan.status).toBe('ok');
              expect(firstInvokeAgentSpan.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan.attributes['vercel.ai.operationId']?.value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstInvokeAgentSpan.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  (span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string | undefined)?.includes(
                    'First span here!',
                  ),
              )!;
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan.status).toBe('ok');
              expect(firstGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan.attributes['vercel.ai.operationId']?.value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
              expect(firstGenerateContentSpan.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toContain(
                'First span here!',
              );

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              )!;
              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan.status).toBe('ok');
              expect(secondInvokeAgentSpan.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  (span.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string | undefined)?.includes(
                    'Second span here!',
                  ),
              )!;
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan.status).toBe('ok');
              expect(secondGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              )!;
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan.status).toBe('ok');
              expect(toolInvokeAgentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] !== undefined,
              )!;
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan.status).toBe('ok');
              expect(toolGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(toolGenerateContentSpan.attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeDefined();
              expect(toolGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan.status).toBe('ok');
              expect(toolExecutionSpan.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE]?.value).toBe(
                'Get the current weather for a location',
              );
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_INPUT_ATTRIBUTE]).toBeDefined();
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_OUTPUT_ATTRIBUTE]).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai spans when dataCollection.genAi has inputs and outputs disabled', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              )!;
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan.status).toBe('ok');
              expect(firstInvokeAgentSpan.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan.attributes['vercel.ai.operationId']?.value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(firstInvokeAgentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);
              expect(firstInvokeAgentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(30);
              expect(firstInvokeAgentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] === undefined &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              )!;
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan.status).toBe('ok');
              expect(firstGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan.attributes['vercel.ai.operationId']?.value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan.attributes[GEN_AI_SYSTEM_ATTRIBUTE]?.value).toBe('mock-provider');
              expect(firstGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(firstGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 91,
              )!;

              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan.status).toBe('ok');
              expect(secondInvokeAgentSpan.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(secondInvokeAgentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"user","content":"Where is the second span?"}]',
              );
              expect(secondInvokeAgentSpan.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]',
              );

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes['vercel.ai.operationId']?.value === 'ai.generateText.doGenerate' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 91,
              )!;
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan.status).toBe('ok');
              expect(secondGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(secondGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
              expect(secondGenerateContentSpan.attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value as string).toContain(
                'Where is the second span?',
              );
              expect(secondGenerateContentSpan.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string).toContain(
                'Second span here!',
              );

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' && span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
              )!;
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan.status).toBe('ok');

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
              )!;
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan.status).toBe('ok');

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan.status).toBe('ok');
              expect(toolExecutionSpan.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call-1');
              expect(toolExecutionSpan.attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE]?.value).toBe('function');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-error-in-tool.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures error in tool', async () => {
        let transactionEvent: Event | undefined;
        let errorEvent: Event | undefined;

        await createRunner()
          .expect({
            transaction: transaction => {
              transactionEvent = transaction;
            },
          })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(3);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent')!;
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan.name).toBe('invoke_agent');
              expect(invokeAgentSpan.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');

              const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id')!;
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan.name).toBe('generate_content mock-model-id');
              expect(generateContentSpan.status).toBe('ok');
              expect(generateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolSpan).toBeDefined();
              expect(toolSpan.name).toBe('execute_tool getWeather');
              expect(toolSpan.status).toBe('error');
              expect(toolSpan.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
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
        expect(transactionEvent!.transaction).toBe('main');

        expect(errorEvent).toBeDefined();
        expect(errorEvent!.level).toBe('error');
        expect(errorEvent!.tags).toEqual(
          expect.objectContaining({
            'vercel.ai.tool.name': 'getWeather',
            'vercel.ai.tool.callId': 'call-1',
          }),
        );

        // Trace id should be the same for the transaction and error event
        expect(transactionEvent!.contexts!.trace!.trace_id).toBe(errorEvent!.contexts!.trace!.trace_id);
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai related spans', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(7);
              const invokeAgentSpans = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpans).toHaveLength(3);

              const generateContentSpans = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );
              expect(generateContentSpans).toHaveLength(3);

              const toolSpan = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.execute_tool',
              );
              expect(toolSpan).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-tool-loop-agent.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates spans for ToolLoopAgent with tool calls', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(4);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan.name).toBe('invoke_agent weather_agent');
              expect(invokeAgentSpan.status).toBe('ok');
              expect(invokeAgentSpan.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');

              const toolCallsGenerateContentSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["tool-calls"]',
              )!;
              expect(toolCallsGenerateContentSpan).toBeDefined();
              expect(toolCallsGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolCallsGenerateContentSpan.status).toBe('ok');
              expect(toolCallsGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(toolCallsGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(toolCallsGenerateContentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolSpan).toBeDefined();
              expect(toolSpan.name).toBe('execute_tool getWeather');
              expect(toolSpan.status).toBe('ok');
              expect(toolSpan.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call-1');
              expect(toolSpan.attributes[GEN_AI_TOOL_TYPE_ATTRIBUTE]?.value).toBe('function');

              const finalGenerateContentSpan = container.items.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["stop"]',
              )!;
              expect(finalGenerateContentSpan).toBeDefined();
              expect(finalGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(finalGenerateContentSpan.status).toBe('ok');
              expect(finalGenerateContentSpan.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(finalGenerateContentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);
              expect(finalGenerateContentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(25);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-concurrent.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('parents concurrent calls that share one model instance correctly', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              const invokeAgents = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              const generateContents = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );

              // Two concurrent operations -> two invoke_agent + two generate_content spans.
              expect(invokeAgents).toHaveLength(2);
              expect(generateContents).toHaveLength(2);

              const agentSpanIds = new Set(invokeAgents.map(span => span.span_id));

              // Each model call lands under an invoke_agent span...
              for (const span of generateContents) {
                expect(agentSpanIds.has(span.parent_span_id!)).toBe(true);
              }
              // ...a distinct one each (no cross-attribution despite the shared model instance)...
              expect(new Set(generateContents.map(span => span.parent_span_id)).size).toBe(2);
              // ...and both operations sit under the same `main` parent.
              expect(new Set(invokeAgents.map(span => span.parent_span_id)).size).toBe(1);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-concurrent-stream.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      // A single model instance shared by two concurrent `streamText` calls carries only one
      // captured-parent slot, so both model calls must still land under their own `invoke_agent` — not
      // collapse onto whichever operation resolved the shared model last.
      test('parents concurrent streamText calls that share one model instance correctly', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const invokeAgents = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              const generateContents = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );

              // Two concurrent operations -> two invoke_agent + two generate_content spans.
              expect(invokeAgents).toHaveLength(2);
              expect(generateContents).toHaveLength(2);

              const agentSpanIds = new Set(invokeAgents.map(span => span.span_id));

              // Each model call lands under an invoke_agent span...
              for (const span of generateContents) {
                expect(agentSpanIds.has(span.parent_span_id!)).toBe(true);
              }
              // ...a distinct one each (no cross-attribution despite the shared model instance)...
              expect(new Set(generateContents.map(span => span.parent_span_id)).size).toBe(2);
              // ...and both operations sit under the same `main` parent.
              expect(new Set(invokeAgents.map(span => span.parent_span_id)).size).toBe(1);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-stream-text.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates streamText spans with the model call parented to invoke_agent', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              const invokeAgent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();
              expect(invokeAgent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText');

              const generateContent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent).toBeDefined();
              expect(generateContent.parent_span_id).toBe(invokeAgent.span_id);
              expect(generateContent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText.doStream');

              // The stream's final usage/finish/output arrive only as the stream drains, after the
              // channel already resolved the model call. Tapping the stream recovers them onto the
              // model-call span on every path (v7 channel, v6 OTel, v6 orchestrion).
              expect(generateContent.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(generateContent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);
              expect(generateContent.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(30);
              expect(generateContent.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value).toBe('["stop"]');
              expect(generateContent.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Stream response!"}],"finish_reason":"stop"}]',
              );

              // The summed usage and output also land on the parent invoke_agent span, whose own
              // channel result is otherwise undefined for a stream.
              expect(invokeAgent.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(invokeAgent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(30);
              expect(invokeAgent.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"Stream response!"}],"finish_reason":"stop"}]',
              );
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-stream-tools.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures usage, tool calls and output across a multi-step streamText', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const invokeAgent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();
              expect(invokeAgent.status).toBe('ok');
              expect(invokeAgent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText');
              // Usage is summed across the two streamed model calls (10+15, 20+25, 30+40).
              expect(invokeAgent.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(25);
              expect(invokeAgent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(45);
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(70);

              const generateContents = container.items.filter(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              );
              expect(generateContents).toHaveLength(2);
              generateContents.forEach(span => expect(span.parent_span_id).toBe(invokeAgent.span_id));

              // The step that streamed a tool call: tool-call output part + tool-calls finish reason.
              const toolStep = generateContents.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["tool-calls"]',
              )!;
              expect(toolStep).toBeDefined();
              expect(toolStep.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(toolStep.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);
              const toolStepOutput = toolStep.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string;
              expect(toolStepOutput).toContain('"type":"tool_call"');
              expect(toolStepOutput).toContain('getWeather');

              // The step that streamed the final answer text.
              const textStep = generateContents.find(
                span => span.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["stop"]',
              )!;
              expect(textStep).toBeDefined();
              expect(textStep.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);
              expect(textStep.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toContain('Sunny, 72°F.');

              // A tool span is emitted for the streamed tool call. Its parent and recorded input/output
              // vary by path during stream consumption (tool i/o is covered by the non-stream scenario
              // and the v7 path), so here we just assert the span exists with the right name/status.
              const executeTool = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(executeTool).toBeDefined();
              expect(executeTool.status).toBe('ok');
              expect(executeTool.attributes[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-stream-structured-output.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures streamed structured output (streamText with experimental_output)', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              const invokeAgent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();
              expect(invokeAgent.status).toBe('ok');
              expect(invokeAgent.attributes['vercel.ai.operationId']?.value).toBe('ai.streamText');
              expect(invokeAgent.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(30);

              const generateContent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent).toBeDefined();
              expect(generateContent.parent_span_id).toBe(invokeAgent.span_id);
              expect(generateContent.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(12);
              expect(generateContent.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(18);
              expect(generateContent.attributes[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value).toBe('["stop"]');
              // The streamed JSON object is accumulated from the text deltas and captured as the
              // model's output text (embedded as an escaped JSON string in the output message).
              const output = generateContent.attributes[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string;
              expect(output).toContain('San Francisco');
              expect(output).toContain('sunny');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-rejected-model.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('finishes spans with an error status when the operation rejects', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              // The model throws, so the operation rejects. The spans must still be *finished* (and
              // therefore present in the transaction) with an error status — not left open.
              const invokeAgent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();
              expect(invokeAgent.status).toBe('error');

              const generateContent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent).toBeDefined();
              expect(generateContent.status).toBe('error');
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-provider-metadata.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('derives provider-metadata token breakdown, conversation id and system instructions', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));
              const generateContent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent).toBeDefined();

              // Cache/reasoning token breakdown and conversation id are derived from the model's
              // `providerMetadata` — by the OTel processor on v6 and by the channel subscriber on v7,
              // both via the shared `getProviderMetadataAttributes` helper, so the shape is identical.
              expect(generateContent.attributes[GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE]?.value).toBe(5);
              expect(generateContent.attributes['gen_ai.usage.output_tokens.reasoning']?.value).toBe(7);
              expect(generateContent.attributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value).toBe('resp_abc123');

              const invokeAgent = container.items.find(
                span => span.attributes['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();

              // The system prompt is supplied via the v7-only `instructions` option. Only the channel
              // instrumentation surfaces it (as `gen_ai.system_instructions`); v6 has no such option.
              if (version === '7') {
                const expected = '[{"type":"text","content":"You are a helpful assistant."}]';
                expect(invokeAgent.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]?.value).toBe(expected);
                expect(generateContent.attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]?.value).toBe(expected);
              }
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-embeddings.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      // `ai` v7 only routes `embed` through its telemetry tracing channel — `embedMany` is dispatched
      // via the callback-only path and never published — so the channel-based integration (v7 and v6
      // orchestrion) cannot see it there. On v6 both the OTel processor and the orchestrion channels
      // instrument `embedMany`, so its span is expected only on v6.
      const embedManyInstrumented = version === '6';

      test('creates embeddings spans for embed and embedMany', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));

              const embedSpan = container.items.find(
                span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === 'Embedding test!',
              )!;
              expect(embedSpan).toBeDefined();
              expect(embedSpan.name).toBe('embeddings mock-model-id');
              expect(embedSpan.status).toBe('ok');
              expect(embedSpan.attributes['sentry.op']?.value).toBe('gen_ai.embeddings');
              expect(embedSpan.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(embedSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);

              const embedManySpan = container.items.find(
                span => span.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]?.value === '["First input","Second input"]',
              );
              if (embedManyInstrumented) {
                expect(embedManySpan).toBeDefined();
                expect(embedManySpan!.name).toBe('embeddings mock-model-id');
                expect(embedManySpan!.status).toBe('ok');
                expect(embedManySpan!.attributes['sentry.op']?.value).toBe('gen_ai.embeddings');
                expect(embedManySpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);
              } else {
                expect(embedManySpan).toBeUndefined();
              }
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );

  createEsmTests(
    __dirname,
    'scenario-generate-object.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      // ai v7's native `ai:telemetry` channel does not publish a top-level `generateObject` operation
      // (like `embedMany`, it's dispatched via a path the channel never sees), so the channel-based
      // integration can't surface it on v7. v4/v5/v6 use orchestrion, which injects the `generateObject`
      // channel directly — v6 is exercised here, v4 in the base suite.
      test.skipIf(version === '7')('creates spans for generateObject', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes['sentry.origin']?.value).toBe(expectedOrigin));

              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent');
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan!.status).toBe('ok');
              expect(invokeAgentSpan!.attributes['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan!.attributes['vercel.ai.operationId']?.value).toBe('ai.generateObject');
              expect(invokeAgentSpan!.attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);
              expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(25);
              expect(invokeAgentSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(40);

              const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id');
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan!.status).toBe('ok');
              expect(generateContentSpan!.attributes['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(generateContentSpan!.attributes['vercel.ai.operationId']?.value).toBe(
                'ai.generateObject.doGenerate',
              );
              expect(generateContentSpan!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(generateContentSpan!.attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        ai: vercelAiVersion,
      },
    },
  );
});
