import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('Should record spans for mcp handlers', async ({ baseURL }) => {
  const transport = new SSEClientTransport(new URL(`${baseURL}/sse`));

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  const initializeSegmentPromise = waitForStreamedSpan(
    'node-express',
    segment => segment.is_segment && segment.name === 'initialize',
  );

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeSegment = await initializeSegmentPromise;
    expect(initializeSegment).toBeDefined();
    expect(getSpanOp(initializeSegment)).toEqual('mcp.server');
    expect(initializeSegment.attributes?.['mcp.method.name']?.value).toEqual('initialize');
    expect(initializeSegment.attributes?.['mcp.client.name']?.value).toEqual('test-client');
    expect(initializeSegment.attributes?.['mcp.server.name']?.value).toEqual('Echo');
  });

  await test.step('tool handler', async () => {
    const postSegmentPromise = waitForStreamedSpan(
      'node-express',
      segment => segment.is_segment && segment.name === 'POST /messages',
    );
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express',
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

    const postSegment = await postSegmentPromise;
    expect(postSegment).toBeDefined();
    expect(getSpanOp(postSegment)).toEqual('http.server');

    const toolSegment = await toolSegmentPromise;
    expect(toolSegment).toBeDefined();
    expect(getSpanOp(toolSegment)).toEqual('mcp.server');
    expect(toolSegment.attributes?.['mcp.method.name']?.value).toEqual('tools/call');
    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('registerTool handler', async () => {
    const postSegmentPromise = waitForStreamedSpan(
      'node-express',
      segment => segment.is_segment && segment.name === 'POST /messages',
    );
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express',
      segment => segment.is_segment && segment.name === 'tools/call echo-register',
    );

    const toolResult = await client.callTool({
      name: 'echo-register',
      arguments: {
        message: 'foobar',
      },
    });

    expect(toolResult).toMatchObject({
      content: [
        {
          text: 'registerTool echo: foobar',
          type: 'text',
        },
      ],
    });

    const postSegment = await postSegmentPromise;
    expect(postSegment).toBeDefined();
    expect(getSpanOp(postSegment)).toEqual('http.server');

    const toolSegment = await toolSegmentPromise;
    expect(toolSegment).toBeDefined();
    expect(getSpanOp(toolSegment)).toEqual('mcp.server');
    expect(toolSegment.attributes?.['mcp.method.name']?.value).toEqual('tools/call');
    expect(toolSegment.attributes?.['mcp.tool.name']?.value).toEqual('echo-register');
  });

  await test.step('resource handler', async () => {
    const postSegmentPromise = waitForStreamedSpan(
      'node-express',
      segment => segment.is_segment && segment.name === 'POST /messages',
    );
    const resourceSegmentPromise = waitForStreamedSpan(
      'node-express',
      segment => segment.is_segment && segment.name === 'resources/read',
    );

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const postSegment = await postSegmentPromise;
    expect(postSegment).toBeDefined();
    expect(getSpanOp(postSegment)).toEqual('http.server');

    const resourceSegment = await resourceSegmentPromise;
    expect(resourceSegment).toBeDefined();
    expect(getSpanOp(resourceSegment)).toEqual('mcp.server');
    expect(resourceSegment.attributes?.['mcp.method.name']?.value).toEqual('resources/read');
    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('prompt handler', async () => {
    const postSegmentPromise = waitForStreamedSpan(
      'node-express',
      segment => segment.is_segment && segment.name === 'POST /messages',
    );
    const promptSegmentPromise = waitForStreamedSpan(
      'node-express',
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

    const postSegment = await postSegmentPromise;
    expect(postSegment).toBeDefined();
    expect(getSpanOp(postSegment)).toEqual('http.server');

    const promptSegment = await promptSegmentPromise;
    expect(promptSegment).toBeDefined();
    expect(getSpanOp(promptSegment)).toEqual('mcp.server');
    expect(promptSegment.attributes?.['mcp.method.name']?.value).toEqual('prompts/get');
    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('error tool sets span status to error', async () => {
    const toolSegmentPromise = waitForStreamedSpan(
      'node-express',
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
});

test('resolves capture policy when the MCP server is wrapped before Sentry.init', async ({ baseURL }) => {
  const transport = new SSEClientTransport(new URL(`${baseURL}/capture-policy/sse`));
  const client = new Client({
    name: 'capture-policy-client',
    version: '1.0.0',
  });
  await client.connect(transport);

  const toolSegmentPromise = waitForStreamedSpan(
    'node-express',
    segment => segment.is_segment && segment.name === 'tools/call capture-policy',
  );
  const privateMessage = 'node-v1-private-capture-policy-message';

  const toolResult = await client.callTool({
    name: 'capture-policy',
    arguments: {
      message: privateMessage,
    },
  });

  expect(toolResult).toMatchObject({
    content: [
      {
        text: `Capture policy result: ${privateMessage}`,
        type: 'text',
      },
    ],
  });

  const toolSegment = await toolSegmentPromise;
  const traceData = toolSegment.attributes;

  expect(traceData?.['mcp.method.name']?.value).toBe('tools/call');
  expect(traceData?.['mcp.tool.name']?.value).toBe('capture-policy');
  expect(traceData?.['mcp.tool.result.content_count']?.value).toBe(1);
  expect(traceData?.['mcp.tool.result.content_type']?.value).toBe('text');
  expect(traceData?.['mcp.request.argument.message']?.value).toBeUndefined();
  expect(traceData?.['mcp.tool.result.content']?.value).toBeUndefined();
  const mcpAttributes = Object.fromEntries(Object.entries(traceData).filter(([key]) => key.startsWith('mcp.')));
  expect(JSON.stringify(mcpAttributes)).not.toContain(privateMessage);

  await client.close();
});

/**
 * Tests for StreamableHTTPServerTransport (wrapper transport pattern)
 *
 * StreamableHTTPServerTransport wraps WebStandardStreamableHTTPServerTransport via getters/setters.
 * This causes different `this` values in onmessage vs send, which was breaking span correlation.
 *
 * The fix uses sessionId as the correlation key instead of transport object reference.
 * This test verifies that spans are correctly recorded when using the wrapper transport.
 *
 * @see https://github.com/getsentry/sentry-mcp/issues/767
 */
test('Should record spans for streamable HTTP transport (wrapper transport pattern)', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-streamable',
    version: '1.0.0',
  });

  const initializeSegmentPromise = waitForStreamedSpan(
    'node-express',
    segment =>
      segment.is_segment &&
      segment.name === 'initialize' &&
      segment.attributes?.['mcp.server.name']?.value === 'Echo-Streamable',
  );

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeSegment = await initializeSegmentPromise;
    expect(initializeSegment).toBeDefined();
    expect(getSpanOp(initializeSegment)).toEqual('mcp.server');
    expect(initializeSegment.attributes?.['mcp.method.name']?.value).toEqual('initialize');
    expect(initializeSegment.attributes?.['mcp.client.name']?.value).toEqual('test-client-streamable');
    expect(initializeSegment.attributes?.['mcp.server.name']?.value).toEqual('Echo-Streamable');
    // Verify it's using a StreamableHTTP transport (may be wrapper or inner depending on environment)
    expect(initializeSegment.attributes?.['mcp.transport']?.value).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('tool handler (tests wrapper transport correlation)', async () => {
    // This is the critical test - without the sessionId fix, the span would not be completed
    // because onmessage and send see different transport instances (wrapper vs inner)
    const toolSegmentPromise = waitForStreamedSpan('node-express', segment => {
      if (!segment.is_segment) return false;
      const transport = segment.attributes?.['mcp.transport']?.value as string | undefined;
      return segment.name === 'tools/call echo' && !!transport?.includes('StreamableHTTPServerTransport');
    });

    const toolResult = await client.callTool({
      name: 'echo',
      arguments: {
        message: 'wrapper-transport-test',
      },
    });

    expect(toolResult).toMatchObject({
      content: [
        {
          text: 'Tool echo: wrapper-transport-test',
          type: 'text',
        },
      ],
    });

    const toolSegment = await toolSegmentPromise;
    expect(toolSegment).toBeDefined();
    expect(getSpanOp(toolSegment)).toEqual('mcp.server');
    expect(toolSegment.attributes?.['mcp.method.name']?.value).toEqual('tools/call');
    expect(toolSegment.attributes?.['mcp.tool.name']?.value).toEqual('echo');
    // This attribute proves the span was completed with results (sessionId correlation worked)
    expect(toolSegment.attributes?.['mcp.tool.result.content_count']?.value).toEqual(1);
  });

  await test.step('resource handler', async () => {
    const resourceSegmentPromise = waitForStreamedSpan('node-express', segment => {
      if (!segment.is_segment) return false;
      const transport = segment.attributes?.['mcp.transport']?.value as string | undefined;
      return segment.name === 'resources/read' && !!transport?.includes('StreamableHTTPServerTransport');
    });

    const resourceResult = await client.readResource({
      uri: 'echo://streamable-test',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: streamable-test', uri: 'echo://streamable-test' }],
    });

    const resourceSegment = await resourceSegmentPromise;
    expect(resourceSegment).toBeDefined();
    expect(getSpanOp(resourceSegment)).toEqual('mcp.server');
    expect(resourceSegment.attributes?.['mcp.method.name']?.value).toEqual('resources/read');
  });

  await test.step('prompt handler', async () => {
    const promptSegmentPromise = waitForStreamedSpan('node-express', segment => {
      if (!segment.is_segment) return false;
      const transport = segment.attributes?.['mcp.transport']?.value as string | undefined;
      return segment.name === 'prompts/get echo' && !!transport?.includes('StreamableHTTPServerTransport');
    });

    const promptResult = await client.getPrompt({
      name: 'echo',
      arguments: {
        message: 'streamable-prompt',
      },
    });

    expect(promptResult).toMatchObject({
      messages: [
        {
          content: {
            text: 'Please process this message: streamable-prompt',
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

  // Clean up - close the client connection
  await client.close();
});
