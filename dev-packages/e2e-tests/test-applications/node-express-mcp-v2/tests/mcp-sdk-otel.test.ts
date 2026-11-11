import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, type SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// Runs in the `MCP SDK OpenTelemetry` variant, where `@modelcontextprotocol/server` emits its own
// OpenTelemetry spans and Sentry registers its tracer provider (`enableOpenTelemetrySetup: true`).
test.skip(process.env.MCP_SDK_OTEL !== '1', 'Only runs in the MCP SDK OpenTelemetry variant');

const PROXY_SERVER_NAME = 'node-express-mcp-v2';

function mcpSpansFor(spans: SerializedStreamedSpan[], method: string): SerializedStreamedSpan[] {
  return spans.filter(span => span.attributes?.['mcp.method.name']?.value === method);
}

/** The trace of one MCP request: its `POST /mcp` segment and every span below it. */
function collectMcpRequestTrace(spanName: string): Promise<SerializedStreamedSpan[]> {
  return collectStreamedSpans(
    PROXY_SERVER_NAME,
    spans => spans.some(span => span.is_segment) && spans.some(span => span.name === spanName),
  );
}

test('enriches the MCP SDK spans instead of duplicating them', async ({ baseURL }) => {
  const client = new Client({ name: 'test-client-v2', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const initializeTracePromise = collectMcpRequestTrace('initialize');
  await client.connect(transport);

  await test.step('initialize', async () => {
    const spans = await initializeTracePromise;
    const initializeSpans = mcpSpansFor(spans, 'initialize');
    expect(initializeSpans).toHaveLength(1);

    const [initializeSpan] = initializeSpans;
    expect(getSpanOp(initializeSpan!)).toBe('mcp.server');
    expect(initializeSpan!.attributes?.['sentry.kind']?.value).toBe('server');
    expect(initializeSpan!.attributes?.['mcp.client.name']?.value).toBe('test-client-v2');
    expect(initializeSpan!.attributes?.['mcp.server.name']?.value).toBe('Echo-V2');
    expect(initializeSpan!.attributes?.['mcp.transport']?.value).toMatch(/StreamableHTTPServerTransport/);

    // The MCP SDK starts its span inside the request, so it is no longer a segment of its own.
    expect(initializeSpan!.is_segment).toBe(false);
    expect(getSpanOp(spans.find(span => span.is_segment)!)).toBe('http.server');
  });

  await test.step('tools/call', async () => {
    const toolTracePromise = collectMcpRequestTrace('tools/call echo');

    const toolResult = await client.callTool({ name: 'echo', arguments: { message: 'foobar' } });
    expect(toolResult).toMatchObject({ content: [{ text: 'Tool echo: foobar', type: 'text' }] });

    const spans = await toolTracePromise;
    const toolSpans = mcpSpansFor(spans, 'tools/call');
    expect(toolSpans).toHaveLength(1);

    const [toolSpan] = toolSpans;
    expect(toolSpan!.name).toBe('tools/call echo');
    expect(getSpanOp(toolSpan!)).toBe('mcp.server');
    expect(toolSpan!.attributes?.['sentry.kind']?.value).toBe('server');
    expect(toolSpan!.attributes?.['mcp.tool.name']?.value).toBe('echo');
    expect(toolSpan!.attributes?.['mcp.request.argument.message']?.value).toBe('"foobar"');
    expect(toolSpan!.attributes?.['mcp.tool.result.content_count']?.value).toBe(1);
  });

  await test.step('prompts/get', async () => {
    const promptTracePromise = collectMcpRequestTrace('prompts/get echo');

    await client.getPrompt({ name: 'echo', arguments: { message: 'foobar' } });

    const spans = await promptTracePromise;
    const promptSpans = mcpSpansFor(spans, 'prompts/get');
    expect(promptSpans).toHaveLength(1);
    expect(getSpanOp(promptSpans[0]!)).toBe('mcp.server');
    expect(promptSpans[0]!.attributes?.['mcp.prompt.name']?.value).toBe('echo');
  });

  await test.step('tool error', async () => {
    const toolTracePromise = collectMcpRequestTrace('tools/call always-error');

    try {
      await client.callTool({ name: 'always-error', arguments: {} });
    } catch {
      // Expected: MCP SDK throws when the tool returns a JSON-RPC error
    }

    const spans = await toolTracePromise;
    const toolSpans = mcpSpansFor(spans, 'tools/call');
    expect(toolSpans).toHaveLength(1);
    expect(getSpanOp(toolSpans[0]!)).toBe('mcp.server');
    expect(toolSpans[0]!.status).toBe('error');
  });

  await client.close();
});
