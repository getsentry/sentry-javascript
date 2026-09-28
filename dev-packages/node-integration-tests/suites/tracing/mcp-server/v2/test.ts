import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

function mcpSpan(
  container: SerializedStreamedSpanContainer,
  method: string,
): SerializedStreamedSpanContainer['items'][number] {
  const span = container.items.find(
    item =>
      item.attributes['sentry.op']?.value === 'mcp.server' && item.attributes['mcp.method.name']?.value === method,
  );
  // Throwing here makes the (unordered) runner treat this container as "not the one" and wait for
  // the next — streaming batches several segments per container, so the target may be elsewhere.
  expect(span, `expected an mcp.server span for ${method}`).toBeDefined();
  return span!;
}

// The `McpServer` is never manually wrapped — these assertions only pass if the `mcpServer`
// integration auto-instrumented the constructor. Each span type is asserted in its own runner so
// batched span containers can't consume an envelope another assertion still needs.
describe('MCP server spans (streamed, auto-instrumentation, v2)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('auto-instruments the initialize handshake', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: container => {
            const initialize = mcpSpan(container, 'initialize');
            expect(initialize.name).toBe('initialize');
            expect(initialize.attributes['sentry.origin']).toEqual({
              type: 'string',
              value: 'auto.function.mcp_server',
            });
          },
        })
        .start()
        .completed();
    });

    test('auto-instruments a resource read', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: container => {
            const resource = mcpSpan(container, 'resources/read');
            expect(resource.name).toBe('resources/read');
            expect(resource.attributes['mcp.resource.uri']?.value).toBe('echo://foobar');
          },
        })
        .start()
        .completed();
    });

    test('auto-instruments a tool call', async () => {
      await createTestRunner()
        .unordered()
        .expect({
          span: container => {
            const tool = mcpSpan(container, 'tools/call');
            expect(tool.name).toBe('tools/call echo');
          },
        })
        .start()
        .completed();
    });
  });
});
