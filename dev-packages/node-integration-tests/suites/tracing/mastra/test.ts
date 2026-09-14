import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// `@mastra/core` declares `engines.node >= 22.13`, so it can't live in the package's root
// `devDependencies` (that would break `yarn install` on the 20.19 CI matrix). Install it per-suite
// instead, guarded by the `min: 22` skip below.
const MASTRA_DEPENDENCIES = {
  additionalDependencies: {
    '@mastra/core': '1.63.2',
    '@mastra/observability': '1.17.4',
  },
};

// The `executeWithContext` active-context bridge lives in `@mastra/core`'s stable
// `observability/context-storage` entry; pin a version that ships it.
const MASTRA_NESTING_DEPENDENCIES = {
  additionalDependencies: {
    '@mastra/core': '1.65.0',
    '@mastra/observability': '1.17.6',
  },
};

conditionalTest({ min: 22 })('Mastra integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('creates invoke_agent and chat spans following the gen_ai conventions', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              expect(container.items.map(span => span.name).sort()).toEqual([
                'chat gpt-4o-mini',
                'invoke_agent weather_agent',
              ]);

              const agentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.status).toBe('ok');
              expect(agentSpan.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(agentSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
              expect(agentSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('invoke_agent');
              expect(agentSpan.attributes[GEN_AI_AGENT_NAME].value).toBe('weather_agent');
              expect(agentSpan.attributes[GEN_AI_PIPELINE_NAME].value).toBe('weather_agent');
              expect(agentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(12);
              expect(agentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(7);
              expect(agentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(19);
              expect(agentSpan.attributes[GEN_AI_RESPONSE_MODEL].value).toBe('gpt-4o-mini');

              const chatSpan = container.items.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(chatSpan.status).toBe('ok');
              expect(chatSpan.attributes['sentry.op'].value).toBe('gen_ai.chat');
              expect(chatSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
              expect(chatSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('chat');
              expect(chatSpan.attributes[GEN_AI_REQUEST_MODEL].value).toBe('gpt-4o-mini');
              expect(chatSpan.attributes[GEN_AI_PROVIDER_NAME].value).toBe('openai');
              expect(chatSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(19);

              expect(chatSpan.parent_span_id).toBe(agentSpan.span_id);
            },
          })
          .start()
          .completed();
      });

      test('omits prompts and responses when genAI recording is off', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              for (const span of container.items) {
                expect(span.attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
                expect(span.attributes[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
                expect(span.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
              }
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('records prompts and responses when genAI recording is on', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              const agentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe('You report the weather.');
              expect(agentSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
              expect(agentSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');

              const chatSpan = container.items.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(chatSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
              expect(chatSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tools.mjs',
    'instrument-with-pii.mjs',
    (createRunner, test) => {
      test('creates an execute_tool span parented onto the generation', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              expect(container.items.map(span => span.name).sort()).toEqual([
                'chat gpt-4o-mini',
                'execute_tool get_weather',
                'invoke_agent weather_agent',
              ]);

              const toolSpan = container.items.find(span => span.name === 'execute_tool get_weather')!;
              expect(toolSpan.status).toBe('ok');
              expect(toolSpan.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
              expect(toolSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('execute_tool');
              expect(toolSpan.attributes[GEN_AI_TOOL_NAME].value).toBe('get_weather');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_ARGUMENTS].value).toContain('Berlin');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_RESULT].value).toContain('22');

              const chatSpan = container.items.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(toolSpan.parent_span_id).toBe(chatSpan.span_id);

              const agentSpan = container.items.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.attributes[GEN_AI_TOOL_DEFINITIONS].value).toContain('get_weather');
              expect(agentSpan.attributes[GEN_AI_USAGE_INPUT_TOKENS].value).toBe(50);
              expect(agentSpan.attributes[GEN_AI_USAGE_OUTPUT_TOKENS].value).toBe(13);
              expect(agentSpan.attributes[GEN_AI_USAGE_TOTAL_TOKENS].value).toBe(63);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-workflow.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('exports the workflow run but drops workflow steps, which have no conventional op', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              expect(container.items.map(span => span.name)).toEqual(['invoke_agent math_workflow']);

              const workflowSpan = container.items[0]!;
              expect(workflowSpan.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
              expect(workflowSpan.attributes[GEN_AI_PIPELINE_NAME].value).toBe('math_workflow');
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-auto.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('auto-instruments a Mastra app that configured no observability at all', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              expect(container.items.map(span => span.name).sort()).toEqual([
                'chat gpt-4o-mini',
                'invoke_agent weather_agent',
              ]);
              for (const span of container.items) {
                expect(span.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
              }
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-community-exporter.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('still exports its own spans when the community @mastra/sentry exporter is present', async () => {
        await createRunner()
          .expect({ transaction: { transaction: 'mastra-test' } })
          .expect({
            span: container => {
              expect(container.items.map(span => span.name).sort()).toEqual([
                'chat gpt-4o-mini',
                'invoke_agent weather_agent',
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
  createEsmAndCjsTests(
    __dirname,
    'scenario-auto.mjs',
    'instrument-no-bootstrap.mjs',
    (createRunner, test) => {
      test('leaves an unconfigured app alone when bootstrapObservability is false', async () => {
        await createRunner()
          .expect({
            transaction: event => {
              expect(event.transaction).toBe('mastra-test');
              const genAiSpans = (event.spans ?? []).filter(span => span.op?.startsWith('gen_ai.'));
              expect(genAiSpans).toEqual([]);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-tool-nesting.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('nests the model fetch and tool work under the exporter spans', async () => {
        // The exporter's gen_ai spans stream as their own span items; the `dataloader` and model
        // `http.client` spans ride in the transaction event. Cross-reference once both have arrived.
        let chatSpanId: string | undefined;
        let executeToolSpanId: string | undefined;
        let modelFetchParentIds: (string | undefined)[] = [];
        let cacheGetParentIds: (string | undefined)[] = [];

        await createRunner()
          .expect({
            transaction: event => {
              expect(event.transaction).toBe('mastra-test');
              // The model-provider requests Mastra makes for each step.
              const modelFetches = (event.spans ?? []).filter(
                span => span.op === 'http.client' && (span.description ?? '').includes('/v1/chat/completions'),
              );
              expect(modelFetches.length).toBeGreaterThan(0);
              modelFetchParentIds = modelFetches.map(span => span.parent_span_id);

              // The per-key `dataloader.load` spans opened while the tool runs. (dataloader also emits a
              // `dataloader.batch` span nested under a load — its own internal structure.)
              const loadSpans = (event.spans ?? []).filter(
                span => span.op === 'cache.get' && span.description === 'dataloader.load',
              );
              expect(loadSpans.length).toBeGreaterThan(0);
              cacheGetParentIds = loadSpans.map(span => span.parent_span_id);
            },
          })
          .expect({
            span: container => {
              const chat = container.items.find(span => span.attributes['sentry.op']?.value === 'gen_ai.chat')!;
              expect(chat).toBeDefined();
              chatSpanId = chat.span_id;

              const executeTool = container.items.find(
                span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'count_items',
              )!;
              expect(executeTool).toBeDefined();
              expect(executeTool.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              executeToolSpanId = executeTool.span_id;
            },
          })
          .start()
          .completed();

        // The `executeWithContext` bridge makes the exporter spans active during the real work, so the
        // model fetch parents onto the `chat` span and the dataloader loads onto `execute_tool`.
        expect(chatSpanId).toBeDefined();
        expect(executeToolSpanId).toBeDefined();
        expect(new Set(modelFetchParentIds)).toEqual(new Set([chatSpanId]));
        expect(new Set(cacheGetParentIds)).toEqual(new Set([executeToolSpanId]));
      });
    },
    MASTRA_NESTING_DEPENDENCIES,
  );
});
