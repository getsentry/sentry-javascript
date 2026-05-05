import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// TODO: MCP handler spans (tools/call, resources/read, etc.) are not emitted as streamed spans
// with SSE transport — only the POST /messages HTTP server span arrives in the envelope.
// Re-enable once the MCP instrumentation supports span streaming over SSE.
test.skip('Should record streamed spans for mcp handlers', async ({ baseURL }) => {
  const transport = new SSEClientTransport(new URL(`${baseURL}/sse`));

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  const initializeSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return span.name === 'initialize' && getSpanOp(span) === 'mcp.server' && span.is_segment;
  });

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeSpan = await initializeSpanPromise;
    expect(initializeSpan).toBeDefined();
    expect(getSpanOp(initializeSpan)).toBe('mcp.server');
    expect(initializeSpan.attributes?.['mcp.method.name']?.value).toBe('initialize');
    expect(initializeSpan.attributes?.['mcp.client.name']?.value).toBe('test-client');
    expect(initializeSpan.attributes?.['mcp.server.name']?.value).toBe('Echo');
  });

  await test.step('tool handler', async () => {
    const postSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'POST /messages' && getSpanOp(span) === 'http.server' && span.is_segment;
    });
    const toolSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'tools/call echo' && getSpanOp(span) === 'mcp.server' && span.is_segment;
    });

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

    const postSpan = await postSpanPromise;
    expect(postSpan).toBeDefined();
    expect(getSpanOp(postSpan)).toBe('http.server');

    const toolSpan = await toolSpanPromise;
    expect(toolSpan).toBeDefined();
    expect(getSpanOp(toolSpan)).toBe('mcp.server');
    expect(toolSpan.attributes?.['mcp.method.name']?.value).toBe('tools/call');
  });

  await test.step('registerTool handler', async () => {
    const postSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'POST /messages' && getSpanOp(span) === 'http.server' && span.is_segment;
    });
    const toolSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'tools/call echo-register' && getSpanOp(span) === 'mcp.server' && span.is_segment;
    });

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

    const postSpan = await postSpanPromise;
    expect(postSpan).toBeDefined();
    expect(getSpanOp(postSpan)).toBe('http.server');

    const toolSpan = await toolSpanPromise;
    expect(toolSpan).toBeDefined();
    expect(getSpanOp(toolSpan)).toBe('mcp.server');
    expect(toolSpan.attributes?.['mcp.method.name']?.value).toBe('tools/call');
    expect(toolSpan.attributes?.['mcp.tool.name']?.value).toBe('echo-register');
  });

  await test.step('resource handler', async () => {
    const postSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'POST /messages' && getSpanOp(span) === 'http.server' && span.is_segment;
    });
    const resourceSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'resources/read echo://foobar' && getSpanOp(span) === 'mcp.server' && span.is_segment;
    });

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const postSpan = await postSpanPromise;
    expect(postSpan).toBeDefined();
    expect(getSpanOp(postSpan)).toBe('http.server');

    const resourceSpan = await resourceSpanPromise;
    expect(resourceSpan).toBeDefined();
    expect(getSpanOp(resourceSpan)).toBe('mcp.server');
    expect(resourceSpan.attributes?.['mcp.method.name']?.value).toBe('resources/read');
  });

  await test.step('prompt handler', async () => {
    const postSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'POST /messages' && getSpanOp(span) === 'http.server' && span.is_segment;
    });
    const promptSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'prompts/get echo' && getSpanOp(span) === 'mcp.server' && span.is_segment;
    });

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

    const postSpan = await postSpanPromise;
    expect(postSpan).toBeDefined();
    expect(getSpanOp(postSpan)).toBe('http.server');

    const promptSpan = await promptSpanPromise;
    expect(promptSpan).toBeDefined();
    expect(getSpanOp(promptSpan)).toBe('mcp.server');
    expect(promptSpan.attributes?.['mcp.method.name']?.value).toBe('prompts/get');
  });

  await test.step('error tool sets span status to error', async () => {
    const toolSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return span.name === 'tools/call always-error' && getSpanOp(span) === 'mcp.server' && span.is_segment;
    });

    try {
      await client.callTool({ name: 'always-error', arguments: {} });
    } catch {
      // Expected: MCP SDK throws when the tool returns a JSON-RPC error
    }

    const toolSpan = await toolSpanPromise;
    expect(toolSpan).toBeDefined();
    expect(getSpanOp(toolSpan)).toBe('mcp.server');
    expect(toolSpan.status).toBe('error');
  });
});

test('Should record streamed spans for streamable HTTP transport (wrapper transport pattern)', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-streamable',
    version: '1.0.0',
  });

  const initializeSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return (
      span.name === 'initialize' &&
      getSpanOp(span) === 'mcp.server' &&
      span.attributes?.['mcp.server.name']?.value === 'Echo-Streamable'
    );
  });

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeSpan = await initializeSpanPromise;
    expect(initializeSpan).toBeDefined();
    expect(getSpanOp(initializeSpan)).toBe('mcp.server');
    expect(initializeSpan.attributes?.['mcp.method.name']?.value).toBe('initialize');
    expect(initializeSpan.attributes?.['mcp.client.name']?.value).toBe('test-client-streamable');
    expect(initializeSpan.attributes?.['mcp.server.name']?.value).toBe('Echo-Streamable');
    expect(String(initializeSpan.attributes?.['mcp.transport']?.value)).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('tool handler (tests wrapper transport correlation)', async () => {
    const toolSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return (
        span.name === 'tools/call echo' &&
        getSpanOp(span) === 'mcp.server' &&
        String(span.attributes?.['mcp.transport']?.value).includes('StreamableHTTPServerTransport')
      );
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

    const toolSpan = await toolSpanPromise;
    expect(toolSpan).toBeDefined();
    expect(getSpanOp(toolSpan)).toBe('mcp.server');
    expect(toolSpan.attributes?.['mcp.method.name']?.value).toBe('tools/call');
    expect(toolSpan.attributes?.['mcp.tool.name']?.value).toBe('echo');
    expect(toolSpan.attributes?.['mcp.tool.result.content_count']?.value).toBe(1);
  });

  await test.step('resource handler', async () => {
    const resourceSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return (
        span.name === 'resources/read echo://streamable-test' &&
        getSpanOp(span) === 'mcp.server' &&
        String(span.attributes?.['mcp.transport']?.value).includes('StreamableHTTPServerTransport')
      );
    });

    const resourceResult = await client.readResource({
      uri: 'echo://streamable-test',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: streamable-test', uri: 'echo://streamable-test' }],
    });

    const resourceSpan = await resourceSpanPromise;
    expect(resourceSpan).toBeDefined();
    expect(getSpanOp(resourceSpan)).toBe('mcp.server');
    expect(resourceSpan.attributes?.['mcp.method.name']?.value).toBe('resources/read');
  });

  await test.step('prompt handler', async () => {
    const promptSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
      return (
        span.name === 'prompts/get echo' &&
        getSpanOp(span) === 'mcp.server' &&
        String(span.attributes?.['mcp.transport']?.value).includes('StreamableHTTPServerTransport')
      );
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

    const promptSpan = await promptSpanPromise;
    expect(promptSpan).toBeDefined();
    expect(getSpanOp(promptSpan)).toBe('mcp.server');
    expect(promptSpan.attributes?.['mcp.method.name']?.value).toBe('prompts/get');
  });

  await client.close();
});
