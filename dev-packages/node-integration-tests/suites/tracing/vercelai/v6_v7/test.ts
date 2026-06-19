import { NODE_VERSION, type Event } from '@sentry/node';
import { afterAll, describe, expect } from 'vitest';
import {
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
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

describe.each([
  ['6', {}, '^6.0.0'],
  ['6', { USE_ORCHESTRION: 'true' }, '^6.0.0'],
  ['7', {}, '7.0.0-beta.179'],
  ['7', { USE_ORCHESTRION: 'true' }, '7.0.0-beta.179'],
])('Vercel AI integration (version %s, env %o)', (version, env: Record<string, string>, vercelAiVersion) => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // Vercel AI v7 does not support CJS
  // This fails on Node 18 only, as newer versions of ESM support require
  const nodeVersion = NODE_VERSION.major;
  const failsOnCjs = version === '7' && nodeVersion === 18;

  const useOrchestrion = env.USE_ORCHESTRION === 'true';
  const usesChannels = version === '7' || useOrchestrion;

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
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the first span?"}]',
              )!;
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan.status).toBe('ok');
              expect(firstInvokeAgentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan.attributes?.['vercel.ai.operationId']?.value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"user","content":"Where is the first span?"}]',
              );
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"assistant","parts":[{"type":"text","content":"First span here!"}],"finish_reason":"stop"}]',
              );

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  (span.attributes?.[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string | undefined)?.includes(
                    'First span here!',
                  ),
              )!;
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan.status).toBe('ok');
              expect(firstGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan.attributes?.['vercel.ai.operationId']?.value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeDefined();
              expect(firstGenerateContentSpan.attributes?.[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toContain(
                'First span here!',
              );

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"Where is the second span?"}]',
              )!;
              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan.status).toBe('ok');
              expect(secondInvokeAgentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.invoke_agent');

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  (span.attributes?.[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value as string | undefined)?.includes(
                    'Second span here!',
                  ),
              )!;
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan.status).toBe('ok');
              expect(secondGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value ===
                    '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              )!;
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan.status).toBe('ok');
              expect(toolInvokeAgentSpan.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value).toBe(
                '[{"role":"user","content":"What is the weather in San Francisco?"}]',
              );

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes?.[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] !== undefined,
              )!;
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan.status).toBe('ok');
              expect(toolGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(toolGenerateContentSpan.attributes?.[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE]).toBeDefined();
              expect(toolGenerateContentSpan.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan.status).toBe('ok');
              expect(toolExecutionSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE]?.value).toBe(
                'Get the current weather for a location',
              );
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_INPUT_ATTRIBUTE]).toBeDefined();
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_OUTPUT_ATTRIBUTE]).toBeDefined();
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
      failsOnCjs,
    },
  );

  createEsmTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates ai spans when dataCollection.genAi has inputs and outputs disabled', async () => {
        await createRunner()
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(7);
              const firstInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes?.['vercel.ai.operationId']?.value === 'ai.generateText' &&
                  span.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] === undefined &&
                  span.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              )!;
              expect(firstInvokeAgentSpan).toBeDefined();
              expect(firstInvokeAgentSpan.name).toBe('invoke_agent');
              expect(firstInvokeAgentSpan.status).toBe('ok');
              expect(firstInvokeAgentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(firstInvokeAgentSpan.attributes?.['vercel.ai.operationId']?.value).toBe('ai.generateText');
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]?.value).toBe(30);
              expect(firstInvokeAgentSpan.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const firstGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes?.['vercel.ai.operationId']?.value === 'ai.generateText.doGenerate' &&
                  span.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] === undefined &&
                  span.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 10,
              )!;
              expect(firstGenerateContentSpan).toBeDefined();
              expect(firstGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(firstGenerateContentSpan.status).toBe('ok');
              expect(firstGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(firstGenerateContentSpan.attributes?.['vercel.ai.operationId']?.value).toBe(
                'ai.generateText.doGenerate',
              );
              expect(firstGenerateContentSpan.attributes?.[GEN_AI_SYSTEM_ATTRIBUTE]?.value).toBe('mock-provider');
              expect(firstGenerateContentSpan.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(firstGenerateContentSpan.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]).toBeUndefined();

              const secondInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' &&
                  span.attributes?.['vercel.ai.operationId']?.value === 'ai.generateText' &&
                  span.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 91,
              )!;

              expect(secondInvokeAgentSpan).toBeDefined();
              expect(secondInvokeAgentSpan.name).toBe('invoke_agent');
              expect(secondInvokeAgentSpan.status).toBe('ok');
              expect(secondInvokeAgentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              // On v6, vercel AI natively defaults to recording inputs and outputs by default when telemetry is enabled
              // On v7, we do not have access to this, so this defaults to false in this case
              expect(secondInvokeAgentSpan.attributes?.[GEN_AI_INPUT_MESSAGES_ATTRIBUTE]?.value).toEqual(
                !usesChannels ? '[{"role":"user","content":"Where is the second span?"}]' : undefined,
              );
              expect(secondInvokeAgentSpan.attributes?.[GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE]?.value).toEqual(
                !usesChannels
                  ? '[{"role":"assistant","parts":[{"type":"text","content":"Second span here!"}],"finish_reason":"stop"}]'
                  : undefined,
              );

              const secondGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes?.['vercel.ai.operationId']?.value === 'ai.generateText.doGenerate' &&
                  span.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 91,
              )!;
              expect(secondGenerateContentSpan).toBeDefined();
              expect(secondGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(secondGenerateContentSpan.status).toBe('ok');
              expect(secondGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');

              const toolInvokeAgentSpan = container.items.find(
                span =>
                  span.name === 'invoke_agent' && span.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
              )!;
              expect(toolInvokeAgentSpan).toBeDefined();
              expect(toolInvokeAgentSpan.name).toBe('invoke_agent');
              expect(toolInvokeAgentSpan.status).toBe('ok');

              const toolGenerateContentSpan = container.items.find(
                span =>
                  span.name === 'generate_content mock-model-id' &&
                  span.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value === 15,
              )!;
              expect(toolGenerateContentSpan).toBeDefined();
              expect(toolGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolGenerateContentSpan.status).toBe('ok');

              const toolExecutionSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolExecutionSpan).toBeDefined();
              expect(toolExecutionSpan.name).toBe('execute_tool getWeather');
              expect(toolExecutionSpan.status).toBe('ok');
              expect(toolExecutionSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call-1');
              expect(toolExecutionSpan.attributes?.[GEN_AI_TOOL_TYPE_ATTRIBUTE]?.value).toBe('function');
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
          .withEnv(env)
          .expect({
            transaction: transaction => {
              transactionEvent = transaction;
            },
          })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(3);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent')!;
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan.name).toBe('invoke_agent');
              expect(invokeAgentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.invoke_agent');

              const generateContentSpan = container.items.find(span => span.name === 'generate_content mock-model-id')!;
              expect(generateContentSpan).toBeDefined();
              expect(generateContentSpan.name).toBe('generate_content mock-model-id');
              expect(generateContentSpan.status).toBe('ok');
              expect(generateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolSpan).toBeDefined();
              expect(toolSpan.name).toBe('execute_tool getWeather');
              expect(toolSpan.status).toBe('error');
              expect(toolSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes?.[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
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
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(7);
              const invokeAgentSpans = container.items.filter(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              expect(invokeAgentSpans).toHaveLength(3);

              const generateContentSpans = container.items.filter(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.generate_content',
              );
              expect(generateContentSpans).toHaveLength(3);

              const toolSpan = container.items.find(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.execute_tool',
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
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              expect(container.items).toHaveLength(4);
              const invokeAgentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(invokeAgentSpan).toBeDefined();
              expect(invokeAgentSpan.name).toBe('invoke_agent weather_agent');
              expect(invokeAgentSpan.status).toBe('ok');
              expect(invokeAgentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.invoke_agent');
              expect(invokeAgentSpan.attributes?.[GEN_AI_REQUEST_MODEL_ATTRIBUTE]?.value).toBe('mock-model-id');

              const toolCallsGenerateContentSpan = container.items.find(
                span => span.attributes?.[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["tool-calls"]',
              )!;
              expect(toolCallsGenerateContentSpan).toBeDefined();
              expect(toolCallsGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(toolCallsGenerateContentSpan.status).toBe('ok');
              expect(toolCallsGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(toolCallsGenerateContentSpan.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(10);
              expect(toolCallsGenerateContentSpan.attributes?.[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(20);

              const toolSpan = container.items.find(span => span.name === 'execute_tool getWeather')!;
              expect(toolSpan).toBeDefined();
              expect(toolSpan.name).toBe('execute_tool getWeather');
              expect(toolSpan.status).toBe('ok');
              expect(toolSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes?.[GEN_AI_TOOL_NAME_ATTRIBUTE]?.value).toBe('getWeather');
              expect(toolSpan.attributes?.[GEN_AI_TOOL_CALL_ID_ATTRIBUTE]?.value).toBe('call-1');
              expect(toolSpan.attributes?.[GEN_AI_TOOL_TYPE_ATTRIBUTE]?.value).toBe('function');

              const finalGenerateContentSpan = container.items.find(
                span => span.attributes?.[GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]?.value === '["stop"]',
              )!;
              expect(finalGenerateContentSpan).toBeDefined();
              expect(finalGenerateContentSpan.name).toBe('generate_content mock-model-id');
              expect(finalGenerateContentSpan.status).toBe('ok');
              expect(finalGenerateContentSpan.attributes?.['sentry.op']?.value).toBe('gen_ai.generate_content');
              expect(finalGenerateContentSpan.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]?.value).toBe(15);
              expect(finalGenerateContentSpan.attributes?.[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]?.value).toBe(25);
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
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              const invokeAgents = container.items.filter(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.invoke_agent',
              );
              const generateContents = container.items.filter(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.generate_content',
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
      // `ai` v7 publishes the top-level `streamText`/`step` channel events through a code path that
      // loads `node:diagnostics_channel` via `process.getBuiltinModule()`, which was only added in
      // Node 20.16 / 22.3 and never backported to Node 18. On Node 18 that lookup returns undefined,
      // so the `streamText` event is never published and no `invoke_agent` span is created. The
      // non-streaming ops load the channel via dynamic `import()` and are unaffected.
      test.skipIf(version === '7' && nodeVersion === 18)(
        'creates streamText spans with the model call parented to invoke_agent',
        async () => {
          await createRunner()
            .withEnv(env)
            .expect({ transaction: { transaction: 'main' } })
            .expect({
              span: container => {
                // Every emitted gen_ai span carries the version-appropriate origin.
                container.items
                  .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                  .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
                const invokeAgent = container.items.find(
                  span => span.attributes?.['sentry.op']?.value === 'gen_ai.invoke_agent',
                )!;
                expect(invokeAgent).toBeDefined();
                expect(invokeAgent.attributes?.['vercel.ai.operationId']?.value).toBe('ai.streamText');

                const generateContent = container.items.find(
                  span => span.attributes?.['sentry.op']?.value === 'gen_ai.generate_content',
                )!;
                expect(generateContent).toBeDefined();
                expect(generateContent.parent_span_id).toBe(invokeAgent.span_id);
                expect(generateContent.attributes?.['vercel.ai.operationId']?.value).toBe('ai.streamText.doStream');
              },
            })
            .start()
            .completed();
        },
      );
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
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              // The model throws, so the operation rejects. The spans must still be *finished* (and
              // therefore present in the transaction) with an error status — not left open.
              const invokeAgent = container.items.find(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();
              expect(invokeAgent.status).toBe('error');

              const generateContent = container.items.find(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.generate_content',
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
          .withEnv(env)
          .expect({ transaction: { transaction: 'main' } })
          .expect({
            span: container => {
              // Every emitted gen_ai span carries the version-appropriate origin.
              container.items
                .filter(s => String(s.attributes?.['sentry.op']?.value ?? '').startsWith('gen_ai.'))
                .forEach(s => expect(s.attributes?.['sentry.origin']?.value).toBe(expectedOrigin));
              const generateContent = container.items.find(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.generate_content',
              )!;
              expect(generateContent).toBeDefined();

              // Cache/reasoning token breakdown and conversation id are derived from the model's
              // `providerMetadata` — by the OTel processor on v6 and by the channel subscriber on v7,
              // both via the shared `getProviderMetadataAttributes` helper, so the shape is identical.
              expect(generateContent.attributes?.[GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE]?.value).toBe(5);
              expect(generateContent.attributes?.['gen_ai.usage.output_tokens.reasoning']?.value).toBe(7);
              expect(generateContent.attributes?.[GEN_AI_CONVERSATION_ID_ATTRIBUTE]?.value).toBe('resp_abc123');

              const invokeAgent = container.items.find(
                span => span.attributes?.['sentry.op']?.value === 'gen_ai.invoke_agent',
              )!;
              expect(invokeAgent).toBeDefined();

              // The system prompt is supplied via the v7-only `instructions` option. Only the channel
              // instrumentation surfaces it (as `gen_ai.system_instructions`); v6 has no such option.
              if (version === '7') {
                const expected = '[{"type":"text","content":"You are a helpful assistant."}]';
                expect(invokeAgent.attributes?.[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]?.value).toBe(expected);
                expect(generateContent.attributes?.[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE]?.value).toBe(expected);
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
});
