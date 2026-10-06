import type { SerializedStreamedSpanContainer } from '@sentry/core';
import {
  DB_OPERATION_NAME,
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
  SENTRY_ORIGIN,
  SENTRY_OP,
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual(['chat gpt-4o-mini', 'invoke_agent weather_agent']);

              const agentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
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

              const chatSpan = spans.find(span => span.name === 'chat gpt-4o-mini')!;
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              for (const span of spans) {
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              const agentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
              expect(agentSpan.attributes[GEN_AI_SYSTEM_INSTRUCTIONS].value).toBe('You report the weather.');
              expect(agentSpan.attributes[GEN_AI_INPUT_MESSAGES].value).toContain('What is the weather in Berlin?');
              expect(agentSpan.attributes[GEN_AI_OUTPUT_MESSAGES].value).toContain('It is 22C in Berlin.');

              const chatSpan = spans.find(span => span.name === 'chat gpt-4o-mini')!;
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual([
                'chat gpt-4o-mini',
                'execute_tool get_weather',
                'invoke_agent weather_agent',
              ]);

              const toolSpan = spans.find(span => span.name === 'execute_tool get_weather')!;
              expect(toolSpan.status).toBe('ok');
              expect(toolSpan.attributes['sentry.op'].value).toBe('gen_ai.execute_tool');
              expect(toolSpan.attributes['sentry.origin'].value).toBe('auto.ai.mastra');
              expect(toolSpan.attributes[GEN_AI_OPERATION_NAME].value).toBe('execute_tool');
              expect(toolSpan.attributes[GEN_AI_TOOL_NAME].value).toBe('get_weather');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_ARGUMENTS].value).toContain('Berlin');
              expect(toolSpan.attributes[GEN_AI_TOOL_CALL_RESULT].value).toContain('22');

              const chatSpan = spans.find(span => span.name === 'chat gpt-4o-mini')!;
              expect(toolSpan.parent_span_id).toBe(chatSpan.span_id);

              const agentSpan = spans.find(span => span.name === 'invoke_agent weather_agent')!;
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name)).toEqual(['invoke_agent math_workflow']);

              const workflowSpan = spans[0]!;
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual(['chat gpt-4o-mini', 'invoke_agent weather_agent']);
              for (const span of spans) {
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const spans = allSpans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual(['chat gpt-4o-mini', 'invoke_agent weather_agent']);
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const genAiSpans = allSpans.filter(span =>
                String(span.attributes[SENTRY_OP]?.value ?? '').startsWith('gen_ai.'),
              );
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
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        let chatSpanId: string | undefined;
        let executeToolSpanId: string | undefined;
        let modelFetchParentIds: (string | undefined)[] = [];
        let cacheGetParentIds: (string | undefined)[] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              // The model-provider requests Mastra makes for each step.
              const modelFetches = allSpans.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'http.client' &&
                  String(span.attributes['url.full']?.value ?? '').includes('/v1/chat/completions'),
              );
              expect(modelFetches.length).toBeGreaterThan(0);
              modelFetchParentIds = modelFetches.map(span => span.parent_span_id);

              // The per-key `dataloader.load` spans opened while the tool runs. (dataloader also emits a
              // `dataloader.batch` span nested under a load — its own internal structure.)
              const loadSpans = allSpans.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'cache.get' &&
                  span.attributes[DB_OPERATION_NAME]?.value === 'load',
              );
              expect(loadSpans.length).toBeGreaterThan(0);
              cacheGetParentIds = loadSpans.map(span => span.parent_span_id);
              const chat = allSpans.find(span => span.attributes['sentry.op']?.value === 'gen_ai.chat')!;
              expect(chat).toBeDefined();
              chatSpanId = chat.span_id;

              const executeTool = allSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'count_items')!;
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

  createEsmAndCjsTests(
    __dirname,
    'scenario-stream-nesting.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('nests the model fetch and tool work under the exporter spans when streaming', async () => {
        // Same nesting guarantee as `generate`, but the agent is driven via `stream()` — the model
        // request is a real streaming (SSE) call, and the tool still runs inside `executeWithContext`.
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        let chatSpanId: string | undefined;
        let executeToolSpanId: string | undefined;
        let modelFetchParentIds: (string | undefined)[] = [];
        let cacheGetParentIds: (string | undefined)[] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-test');
              expect(segment).toBeDefined();
              const modelFetches = allSpans.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'http.client' &&
                  String(span.attributes['url.full']?.value ?? '').includes('/v1/chat/completions'),
              );
              expect(modelFetches.length).toBeGreaterThan(0);
              modelFetchParentIds = modelFetches.map(span => span.parent_span_id);

              const loadSpans = allSpans.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'cache.get' &&
                  span.attributes[DB_OPERATION_NAME]?.value === 'load',
              );
              expect(loadSpans.length).toBeGreaterThan(0);
              cacheGetParentIds = loadSpans.map(span => span.parent_span_id);
              const chat = allSpans.find(span => span.attributes['sentry.op']?.value === 'gen_ai.chat')!;
              expect(chat).toBeDefined();
              chatSpanId = chat.span_id;

              const executeTool = allSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'count_items')!;
              expect(executeTool.attributes['sentry.op']?.value).toBe('gen_ai.execute_tool');
              executeToolSpanId = executeTool.span_id;
            },
          })
          .start()
          .completed();

        expect(chatSpanId).toBeDefined();
        expect(executeToolSpanId).toBeDefined();
        expect(new Set(modelFetchParentIds)).toEqual(new Set([chatSpanId]));
        expect(new Set(cacheGetParentIds)).toEqual(new Set([executeToolSpanId]));
      });
    },
    MASTRA_NESTING_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-multi-instance.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('routes tool nesting per Mastra instance through the shared span registry', async () => {
        // Two instances run concurrently in one trace. Each instance's `dataloader.load` must nest under
        // that instance's own `execute_tool` span — if the registry cross-talked, one tool span would
        // have no dataloader child.
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        const toolSpanIds: Record<string, string> = {};
        let loadParentIds: (string | undefined)[] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'mastra-multi');
              expect(segment).toBeDefined();
              const loadSpans = allSpans.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'cache.get' &&
                  span.attributes[DB_OPERATION_NAME]?.value === 'load',
              );
              loadParentIds = loadSpans.map(span => span.parent_span_id);
              for (const toolName of ['count_a', 'count_b']) {
                const toolSpan = allSpans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === toolName)!;
                expect(toolSpan).toBeDefined();
                toolSpanIds[toolName] = toolSpan.span_id;
              }
            },
          })
          .start()
          .completed();

        // Each instance's tool span parents at least one dataloader load — neither is starved.
        for (const toolName of ['count_a', 'count_b']) {
          expect(loadParentIds).toContain(toolSpanIds[toolName]);
        }
        // And every load parents onto one of the two tool spans (no stray reparenting).
        const toolIds = new Set(Object.values(toolSpanIds));
        for (const parent of loadParentIds) {
          expect(toolIds.has(parent!)).toBe(true);
        }
      });
    },
    MASTRA_NESTING_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-error.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('captures an error thrown in a Mastra tool as a Sentry issue', async () => {
        // Span containers can arrive before the error event, so match only the issue.
        await createRunner()
          .ignore('span')
          .expect({
            event: event => {
              const exception = event.exception?.values?.[0];
              expect(exception?.type).toBe('Error');
              expect(exception?.value).toBe('tool blew up');
              // A real stack from the tool, not the exporter's stack-less `errorInfo`.
              expect(exception?.stacktrace?.frames?.length).toBeGreaterThan(0);
              expect(exception?.mechanism?.type).toBe('auto.ai.mastra');
              expect(exception?.mechanism?.handled).toBe(true);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_NESTING_DEPENDENCIES,
  );
});
