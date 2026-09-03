import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

function mcpSpans(container: SerializedStreamedSpanContainer): SerializedStreamedSpanContainer['items'] {
  return container.items.filter(item => item.attributes['sentry.op']?.value === 'mcp.server');
}

describe('MCP server spans (streamed)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('names resource spans after the method alone, keeping the URI on the attribute', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const resourceSpan = mcpSpans(container).find(
              span => span.attributes['mcp.method.name']?.value === 'resources/read',
            );

            expect(resourceSpan?.name).toBe('resources/read');
            expect(resourceSpan?.attributes['mcp.resource.uri']?.value).toBe('echo://foobar');
          },
        })
        .start()
        .completed();
    });

    test('keeps the tool name, which comes from a bounded registry', async () => {
      await createTestRunner()
        .expect({
          span: container => {
            const toolSpan = mcpSpans(container).find(
              span => span.attributes['mcp.method.name']?.value === 'tools/call',
            );

            expect(toolSpan?.name).toBe('tools/call echo');
          },
        })
        .start()
        .completed();
    });
  });
});
