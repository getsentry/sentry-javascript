import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('express tracing - updateName', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    let scenario: ReturnType<typeof runScenario> | undefined;
    async function runScenario() {
      const paths = ['/test/123/span-updateName', '/test/123/updateSpanName', '/test/123/updateSpanNameAndSource'];
      const runner = createRunner();
      const collectors = paths.map(
        path =>
          [path, runner.collectStreamedSpansUntilSegment(span => span.attributes['url.path']?.value === path)] as const,
      );
      const started = runner.start();
      for (const path of paths) {
        await started.makeRequest('get', path);
      }
      await started.completed();
      return new Map(await Promise.all(collectors.map(async ([path, spans]) => [path, await spans] as const)));
    }
    async function getSpans(path: string) {
      scenario ??= runScenario();
      return (await scenario).get(path)!;
    }

    // This test documents the unfortunate behaviour of using `span.updateName` on the server-side.
    // For http.server root spans (which is the root span on the server 99% of the time), Otel's http instrumentation
    // calls `span.updateName` and overwrites whatever the name was set to before (by us or by users).
    test('calling just `span.updateName` updates the final name in express', async () => {
      const container = { items: await getSpans('/test/123/span-updateName') };

      const serverSpan = container.items.find(item => item.is_segment);
      expect(serverSpan?.name).toBe('new-name');
      expect(serverSpan?.attributes[SENTRY_SEGMENT_NAME_SOURCE]).toEqual({ type: 'string', value: 'custom' });
    });

    // This test documents the correct way to update the span name (and implicitly the source) in Node:
    test('calling `Sentry.updateSpanName` updates the final name and source in express', async () => {
      const container = { items: await getSpans('/test/123/updateSpanName') };

      const serverSpan = container.items.find(item => item.is_segment);
      expect(serverSpan).toMatchObject({
        name: 'new-name',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'custom' },
        }),
      });
    });

    // This test documents the correct way to update the span name (and implicitly the source) in Node:
    test('calling `Sentry.updateSpanName` and setting source subsequently updates the final name and sets correct source', async () => {
      const container = { items: await getSpans('/test/123/updateSpanNameAndSource') };

      const serverSpan = container.items.find(item => item.is_segment);
      expect(serverSpan).toMatchObject({
        name: 'new-name',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'http.server' },
          [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'component' },
        }),
      });
    });
  });
});
