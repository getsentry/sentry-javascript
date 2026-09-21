import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// The server in this app is never wrapped with `wrapMcpServerWithSentry` — spans are produced
// solely by the auto-instrumenting `mcpServer` integration against the legacy v1 SDK.
test('auto-instruments a legacy MCP SDK v1 server (no manual wrap)', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-v1-auto',
    version: '1.0.0',
  });

  const initializeSegmentPromise = waitForStreamedSpan(
    'node-express-mcp-v1-auto',
    segment => segment.is_segment && segment.name === 'initialize',
  );

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeSegment = await initializeSegmentPromise;
    expect(initializeSegment).toBeDefined();
    expect(getSpanOp(initializeSegment)).toEqual('mcp.server');
    expect(initializeSegment.attributes?.['mcp.method.name']?.value).toEqual('initialize');
    expect(initializeSegment.attributes?.['mcp.client.name']?.value).toEqual('test-client-v1-auto');
    expect(initializeSegment.attributes?.['mcp.server.name']?.value).toEqual('Echo-V1-Auto');
  });

  await test.step('tool call', async () => {
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v1-auto',
      segment => segment.is_segment && segment.name === 'tools/call echo',
    );

    const toolResult = await client.callTool({
      name: 'echo',
      arguments: {
        message: 'foobar',
      },
    });

    expect(toolResult).toMatchObject({
      content: [
        {
          text: 'Tool echo: foobar',
          type: 'text',
        },
      ],
    });

    const toolSegment = await toolSegmentPromise;
    expect(toolSegment).toBeDefined();
    expect(getSpanOp(toolSegment)).toEqual('mcp.server');
    expect(toolSegment.attributes?.['mcp.method.name']?.value).toEqual('tools/call');
    expect(toolSegment.attributes?.['mcp.tool.name']?.value).toEqual('echo');
  });

  await test.step('resource read', async () => {
    const resourceSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v1-auto',
      segment => segment.is_segment && segment.name === 'resources/read',
    );

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const resourceSegment = await resourceSegmentPromise;
    expect(resourceSegment).toBeDefined();
    expect(getSpanOp(resourceSegment)).toEqual('mcp.server');
    expect(resourceSegment.attributes?.['mcp.method.name']?.value).toEqual('resources/read');
  });

  await test.step('error tool sets span status to error', async () => {
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v1-auto',
      segment => segment.is_segment && segment.name === 'tools/call always-error',
    );

    try {
      await client.callTool({ name: 'always-error', arguments: {} });
    } catch {
      // Expected: MCP SDK throws when the tool returns a JSON-RPC error
    }

    const toolSegment = await toolSegmentPromise;
    expect(toolSegment).toBeDefined();
    expect(getSpanOp(toolSegment)).toEqual('mcp.server');
    expect(toolSegment?.status).toEqual('error');
  });

  await client.close();
});
