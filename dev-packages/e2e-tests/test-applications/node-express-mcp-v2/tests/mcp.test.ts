import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

test('records spans for stable MCP SDK v2 handlers using the register API', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-v2',
    version: '1.0.0',
  });

  const initializeSegmentPromise = waitForStreamedSpan(
    'node-express-mcp-v2',
    segment => segment.is_segment && segment.name === 'initialize',
  );

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeSegment = await initializeSegmentPromise;
    expect(initializeSegment).toBeDefined();
    expect(getSpanOp(initializeSegment)).toEqual('mcp.server');
    expect(initializeSegment.attributes?.['mcp.method.name']?.value).toEqual('initialize');
    expect(initializeSegment.attributes?.['mcp.client.name']?.value).toEqual('test-client-v2');
    expect(initializeSegment.attributes?.['mcp.server.name']?.value).toEqual('Echo-V2');
    expect(initializeSegment.attributes?.['mcp.transport']?.value).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('registerTool handler', async () => {
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v2',
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
    // Proves span was completed with results (span correlation worked end-to-end)
    expect(toolSegment.attributes?.['mcp.tool.result.content_count']?.value).toEqual(1);
  });

  await test.step('registerResource handler', async () => {
    const resourceSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v2',
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

  await test.step('registerPrompt handler', async () => {
    const promptSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v2',
      segment => segment.is_segment && segment.name === 'prompts/get echo',
    );

    const promptResult = await client.getPrompt({
      name: 'echo',
      arguments: {
        message: 'foobar',
      },
    });

    expect(promptResult).toMatchObject({
      messages: [
        {
          content: {
            text: 'Please process this message: foobar',
            type: 'text',
          },
          role: 'user',
        },
      ],
    });

    const promptSegment = await promptSegmentPromise;
    expect(promptSegment).toBeDefined();
    expect(getSpanOp(promptSegment)).toEqual('mcp.server');
    expect(promptSegment.attributes?.['mcp.method.name']?.value).toEqual('prompts/get');
  });

  await test.step('error tool sets span status to error', async () => {
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express-mcp-v2',
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
