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
  expect(span, `expected an mcp.server span for ${method}`).toBeDefined();
  return span!;
}

describe('MCP server spans (streamed, auto-instrumentation, v2)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('auto-instruments initialize, resource reads, and tool calls', async () => {
      const runner = createTestRunner();
      const collectMethod = (method: string) =>
        runner.collectStreamedSpans(spans =>
          spans.some(
            span =>
              span.attributes['sentry.op']?.value === 'mcp.server' &&
              span.attributes['mcp.method.name']?.value === method,
          ),
        );
      const initializePromise = collectMethod('initialize');
      const resourcePromise = collectMethod('resources/read');
      const toolPromise = collectMethod('tools/call');

      await runner.start().completed();

      const [initializeSpans, resourceSpans, toolSpans] = await Promise.all([
        initializePromise,
        resourcePromise,
        toolPromise,
      ]);
      const initialize = mcpSpan({ items: initializeSpans }, 'initialize');
      expect(initialize.name).toBe('initialize');
      expect(initialize.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.function.mcp_server',
      });
      const resource = mcpSpan({ items: resourceSpans }, 'resources/read');
      expect(resource.name).toBe('resources/read');
      expect(resource.attributes['mcp.resource.uri']?.value).toBe('echo://foobar');
      const tool = mcpSpan({ items: toolSpans }, 'tools/call');
      expect(tool.name).toBe('tools/call echo');
    });
  });
});
