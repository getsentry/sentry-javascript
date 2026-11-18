import {
  DB_OPERATION_NAME,
  GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_TOOL_NAME,
  SENTRY_OP,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL } from '@sentry/conventions/op';
import { afterAll, expect, describe } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { supports } from '../../../../utils';
import { join } from 'node:path';
import { MASTRA_NESTING_DEPENDENCIES } from '../dependencies';

describe.runIf(supports({ min: 22 }))('Mastra integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-tool-nesting.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('nests the model fetch and tool work under the exporter spans', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              // The model-provider requests Mastra makes for each step.
              const modelFetches = container.items.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'http.client' &&
                  String(span.attributes[URL_FULL]?.value ?? '').includes('/v1/chat/completions'),
              );
              expect(modelFetches.length).toBeGreaterThan(0);
              const modelFetchParentIds = modelFetches.map(span => span.parent_span_id);

              // The per-key `dataloader.load` spans opened while the tool runs. (dataloader also emits a
              // `dataloader.batch` span nested under a load — its own internal structure.)
              const loadSpans = container.items.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'cache.get' &&
                  span.attributes[DB_OPERATION_NAME]?.value === 'load',
              );
              expect(loadSpans.length).toBeGreaterThan(0);
              const cacheGetParentIds = loadSpans.map(span => span.parent_span_id);
              const chat = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_CHAT)!;
              expect(chat).toBeDefined();
              const chatSpanId = chat.span_id;

              const executeTool = container.items.find(
                span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'count_items',
              )!;
              expect(executeTool.attributes[SENTRY_OP]?.value).toBe(GEN_AI_EXECUTE_TOOL);
              const executeToolSpanId = executeTool.span_id;

              // The `executeWithContext` bridge makes the exporter spans active during the real work, so the
              // model fetch parents onto the `chat` span and the dataloader loads onto `execute_tool`.
              expect(chatSpanId).toBeDefined();
              expect(executeToolSpanId).toBeDefined();
              expect(new Set(modelFetchParentIds)).toEqual(new Set([chatSpanId]));
              expect(new Set(cacheGetParentIds)).toEqual(new Set([executeToolSpanId]));
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_NESTING_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-stream-nesting.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('nests the model fetch and tool work under the exporter spans when streaming', async () => {
        // Same nesting guarantee as `generate`, but the agent is driven via `stream()` — the model
        // request is a real streaming (SSE) call, and the tool still runs inside `executeWithContext`.

        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const modelFetches = container.items.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'http.client' &&
                  String(span.attributes[URL_FULL]?.value ?? '').includes('/v1/chat/completions'),
              );
              expect(modelFetches.length).toBeGreaterThan(0);
              const modelFetchParentIds = modelFetches.map(span => span.parent_span_id);

              const loadSpans = container.items.filter(
                span =>
                  span.attributes[SENTRY_OP]?.value === 'cache.get' &&
                  span.attributes[DB_OPERATION_NAME]?.value === 'load',
              );
              expect(loadSpans.length).toBeGreaterThan(0);
              const cacheGetParentIds = loadSpans.map(span => span.parent_span_id);
              const chat = container.items.find(span => span.attributes[SENTRY_OP]?.value === GEN_AI_CHAT)!;
              expect(chat).toBeDefined();
              expect(chat.attributes[GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK]?.value).toEqual(expect.any(Number));
              const chatSpanId = chat.span_id;

              const executeTool = container.items.find(
                span => span.attributes[GEN_AI_TOOL_NAME]?.value === 'count_items',
              )!;
              expect(executeTool.attributes[SENTRY_OP]?.value).toBe(GEN_AI_EXECUTE_TOOL);
              const executeToolSpanId = executeTool.span_id;

              expect(chatSpanId).toBeDefined();
              expect(executeToolSpanId).toBeDefined();
              expect(new Set(modelFetchParentIds)).toEqual(new Set([chatSpanId]));
              expect(new Set(cacheGetParentIds)).toEqual(new Set([executeToolSpanId]));
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_NESTING_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    join(__dirname, '..'),
    'scenario-multi-instance.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('routes tool nesting per Mastra instance through the shared span registry', async () => {
        // Two instances run concurrently in one trace. Each instance's `dataloader.load` must nest under
        // that instance's own `execute_tool` span — if the registry cross-talked, one tool span would
        // have no dataloader child.

        const runner = createRunner();
        const spansPromise = runner.collectStreamedSpansUntilSegment('mastra-multi');

        await runner.start().completed();

        const spans = await spansPromise;
        const loadSpans = spans.filter(
          span =>
            span.attributes[SENTRY_OP]?.value === 'cache.get' && span.attributes[DB_OPERATION_NAME]?.value === 'load',
        );
        const loadParentIds = loadSpans.map(span => span.parent_span_id);
        const toolSpanIds: Record<string, string> = {};
        for (const toolName of ['count_a', 'count_b']) {
          const toolSpan = spans.find(span => span.attributes[GEN_AI_TOOL_NAME]?.value === toolName)!;
          expect(toolSpan).toBeDefined();
          toolSpanIds[toolName] = toolSpan.span_id;
        }

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
    join(__dirname, '..'),
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
