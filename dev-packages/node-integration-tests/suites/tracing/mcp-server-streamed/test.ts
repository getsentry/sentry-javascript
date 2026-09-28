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

function assertHttpSpans(
  container: SerializedStreamedSpanContainer,
  transport: string,
  firstMethod: 'initialize' | 'server/discover',
): void {
  const spans = mcpSpans(container);
  expect(spans).toHaveLength(4);

  for (const [id, method, userAgent] of [
    ['1', firstMethod, firstMethod === 'initialize' ? 'initialize-client/1.0' : 'discovery-client/1.0'],
    ['2', 'tools/list', 'tools-client/2.0'],
    ['3', 'resources/list', 'resources-client/3.0'],
    ['4', 'tools/list', undefined],
  ]) {
    const span = spans.find(item => item.attributes['mcp.request.id']?.value === id);
    expect(span).toBeDefined();
    expect(span?.attributes['mcp.method.name']?.value).toBe(method);
    expect(span?.attributes['mcp.transport']?.value).toBe(transport);
    expect(span?.attributes['network.protocol.name']?.value).toBe('http');
    expect(span?.attributes['network.protocol.version']).toBeUndefined();
    expect(span?.attributes['network.transport']).toBeUndefined();
    expect(span?.attributes['user_agent.original']?.value).toBe(userAgent);
    expect(span?.status).toBe('ok');
  }

  const unsupportedSpan = spans.find(span => span.attributes['mcp.request.id']?.value === '3');
  expect(unsupportedSpan?.attributes['rpc.response.status_code']?.value).toBe('-32601');
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
      await createTestRunner().unordered().expect({ span: assertInitializeSpan }).start().completed();
    });

    test('captures the queued request with Sentry OpenTelemetry setup enabled', async () => {
      await createTestRunner()
        .withEnv({ ENABLE_OTEL: 'true' })
        .unordered()
        .expect({ span: assertInitializeSpan })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-v1.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('captures an MCP v1 initialize request queued before transport start once', async () => {
        await createTestRunner().unordered().expect({ span: assertInitializeSpan }).start().completed();
      });
    },
    { additionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0' } },
  );

  createEsmAndCjsTests(__dirname, 'scenario-http-v2.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('captures request-local HTTP metadata for modern discovery and unsupported methods', async () => {
      await createTestRunner()
        .unordered()
        .expect({ span: container => assertHttpSpans(container, 'PerRequestHTTPServerTransport', 'server/discover') })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-http-v1.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('preserves a custom transport class and request-local MCP v1 HTTP metadata', async () => {
        await createTestRunner()
          .unordered()
          .expect({ span: container => assertHttpSpans(container, 'CustomTransport', 'initialize') })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { '@modelcontextprotocol/sdk': '1.30.0' } },
  );
});
