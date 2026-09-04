import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

function mcpSpans(container: SerializedStreamedSpanContainer): SerializedStreamedSpanContainer['items'] {
  return container.items.filter(item => item.attributes['sentry.op']?.value === 'mcp.server');
}

function assertInitializeSpan(container: SerializedStreamedSpanContainer): void {
  const initializeSpans = mcpSpans(container).filter(
    span => span.attributes['mcp.method.name']?.value === 'initialize',
  );

  expect(initializeSpans).toHaveLength(1);
  const initializeSpan = initializeSpans[0]!;
  expect(initializeSpan.name).toBe('initialize');
  expect(initializeSpan.status).toBe('ok');
  expect(initializeSpan.attributes['sentry.op']).toEqual({ type: 'string', value: 'mcp.server' });
  expect(initializeSpan.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.function.mcp_server' });
  expect(initializeSpan.attributes['test.mcp.initialize_spans_started']).toEqual({ type: 'integer', value: 1 });
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

  createEsmAndCjsTests(__dirname, 'scenario-start-v2.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('captures an MCP v2 initialize request queued before transport start once', async () => {
      await createTestRunner().expect({ span: assertInitializeSpan }).start().completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-v1.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('captures an MCP v1 initialize request queued before transport start once', async () => {
        await createTestRunner().expect({ span: assertInitializeSpan }).start().completed();
      });
    },
    { additionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0' } },
  );

  createEsmAndCjsTests(__dirname, 'scenario-start-v2.mjs', 'instrument-otel.mjs', (createTestRunner, test) => {
    test('captures the queued request with Sentry OpenTelemetry setup enabled', async () => {
      await createTestRunner().expect({ span: assertInitializeSpan }).start().completed();
    });
  });
});
