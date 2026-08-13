import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const APP_NAME = 'node-express-streaming';
const LEGACY_SSE_TRACE_ID = '0123456789abcdef0123456789abcdef';
const LEGACY_SSE_TRACE_HEADER = `${LEGACY_SSE_TRACE_ID}-0123456789abcdef-1`;
const STREAMABLE_TRACE_ID = 'fedcba9876543210fedcba9876543210';
const STREAMABLE_TRACE_HEADER = `${STREAMABLE_TRACE_ID}-fedcba9876543210-1`;

function waitForMcpSpan(spanName: string, serverName: string) {
  return waitForStreamedSpan(APP_NAME, span => {
    return (
      span.name === spanName &&
      getSpanOp(span) === 'mcp.server' &&
      !span.is_segment &&
      span.attributes['mcp.server.name']?.value === serverName
    );
  });
}

function waitForHttpSpan(spanName: string) {
  return waitForStreamedSpan(APP_NAME, span => {
    return span.name === spanName && getSpanOp(span) === 'http.server' && span.is_segment;
  });
}

function expectMcpSpanToBeHttpChild(
  httpSpan: Awaited<ReturnType<typeof waitForStreamedSpan>>,
  mcpSpan: Awaited<ReturnType<typeof waitForStreamedSpan>>,
) {
  expect(httpSpan.is_segment).toBe(true);
  expect(mcpSpan.is_segment).toBe(false);
  expect(mcpSpan.trace_id).toBe(httpSpan.trace_id);
  expect(mcpSpan.parent_span_id).toBeTruthy();
  expect(mcpSpan.parent_span_id).not.toBe(mcpSpan.span_id);
}

test('records streamed MCP child spans for legacy SSE handlers', async ({ baseURL }) => {
  test.setTimeout(60_000);
  const transport = new SSEClientTransport(new URL(`${baseURL}/sse`), {
    requestInit: { headers: { 'sentry-trace': LEGACY_SSE_TRACE_HEADER } },
  });
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });
  const initializeHttpSpanPromise = waitForHttpSpan('POST /messages');
  const initializeSpanPromise = waitForMcpSpan('initialize', 'Echo');

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const [initializeHttpSpan, initializeSpan] = await Promise.all([initializeHttpSpanPromise, initializeSpanPromise]);
    expectMcpSpanToBeHttpChild(initializeHttpSpan, initializeSpan);
    expect(initializeSpan.trace_id).toBe(LEGACY_SSE_TRACE_ID);
    expect(initializeSpan.attributes['mcp.method.name']?.value).toBe('initialize');
    expect(initializeSpan.attributes['mcp.client.name']?.value).toBe('test-client');
    expect(initializeSpan.attributes['mcp.server.name']?.value).toBe('Echo');
  });

  await test.step('tool handler', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /messages');
    const toolSpanPromise = waitForMcpSpan('tools/call echo', 'Echo');

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

    const [httpSpan, toolSpan] = await Promise.all([httpSpanPromise, toolSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, toolSpan);
    expect(toolSpan.attributes['mcp.method.name']?.value).toBe('tools/call');
    expect(toolSpan.attributes['gen_ai.operation.name']?.value).toBe('execute_tool');
    expect(toolSpan.attributes['gen_ai.tool.call.arguments']?.value).toBe('{"message":"foobar"}');
    expect(toolSpan.attributes['gen_ai.tool.call.result']?.value).toBe(
      '{"content":[{"type":"text","text":"Tool echo: foobar"}]}',
    );
    expect(toolSpan.attributes['gen_ai.tool.name']?.value).toBe('echo');
    expect(toolSpan.attributes['mcp.tool.name']?.value).toBe('echo');
    expect(toolSpan.attributes['jsonrpc.request.id']?.value).toBeDefined();
    expect(toolSpan.attributes['mcp.request.id']?.value).toBe(toolSpan.attributes['jsonrpc.request.id']?.value);
  });

  await test.step('registerTool handler', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /messages');
    const toolSpanPromise = waitForMcpSpan('tools/call echo-register', 'Echo');

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

    const [httpSpan, toolSpan] = await Promise.all([httpSpanPromise, toolSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, toolSpan);
    expect(toolSpan.attributes['mcp.method.name']?.value).toBe('tools/call');
    expect(toolSpan.attributes['gen_ai.tool.name']?.value).toBe('echo-register');
    expect(toolSpan.attributes['mcp.tool.name']?.value).toBe('echo-register');
  });

  await test.step('resource handler', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /messages');
    const resourceSpanPromise = waitForMcpSpan('resources/read', 'Echo');

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const [httpSpan, resourceSpan] = await Promise.all([httpSpanPromise, resourceSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, resourceSpan);
    expect(resourceSpan.name).toBe('resources/read');
    expect(resourceSpan.attributes['mcp.method.name']?.value).toBe('resources/read');
  });

  await test.step('prompt handler', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /messages');
    const promptSpanPromise = waitForMcpSpan('prompts/get echo', 'Echo');

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

    const [httpSpan, promptSpan] = await Promise.all([httpSpanPromise, promptSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, promptSpan);
    expect(promptSpan.attributes['mcp.method.name']?.value).toBe('prompts/get');
    expect(promptSpan.attributes['gen_ai.prompt.name']?.value).toBe('echo');
    expect(promptSpan.attributes['gen_ai.prompt.variable.message']?.value).toBe('foobar');
    expect(promptSpan.attributes['mcp.prompt.name']?.value).toBe('echo');
    expect(promptSpan.attributes['mcp.request.argument.message']?.value).toBe('"foobar"');
  });

  await test.step('error tool sets span status to error', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /messages');
    const toolSpanPromise = waitForMcpSpan('tools/call always-error', 'Echo');

    await expect(client.callTool({ name: 'always-error', arguments: {} })).resolves.toMatchObject({ isError: true });

    const [httpSpan, toolSpan] = await Promise.all([httpSpanPromise, toolSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, toolSpan);
    expect(toolSpan.status).toBe('error');
  });

  await client.close();
});

/**
 * StreamableHTTPServerTransport wraps WebStandardStreamableHTTPServerTransport via getters and setters,
 * so onmessage and send can observe different `this` values. This verifies that response completion
 * remains correlated with the original request while the MCP spans retain their HTTP parent.
 *
 * @see https://github.com/getsentry/sentry-mcp/issues/767
 */
test('records streamed MCP child spans for streamable HTTP handlers', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
    requestInit: { headers: { 'sentry-trace': STREAMABLE_TRACE_HEADER } },
  });
  const client = new Client({
    name: 'test-client-streamable',
    version: '1.0.0',
  });
  const initializeHttpSpanPromise = waitForHttpSpan('POST /mcp');
  const initializeSpanPromise = waitForMcpSpan('initialize', 'Echo-Streamable');

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const [initializeHttpSpan, initializeSpan] = await Promise.all([initializeHttpSpanPromise, initializeSpanPromise]);
    expectMcpSpanToBeHttpChild(initializeHttpSpan, initializeSpan);
    expect(initializeSpan.trace_id).toBe(STREAMABLE_TRACE_ID);
    expect(initializeSpan.attributes['mcp.method.name']?.value).toBe('initialize');
    expect(initializeSpan.attributes['mcp.client.name']?.value).toBe('test-client-streamable');
    expect(initializeSpan.attributes['mcp.server.name']?.value).toBe('Echo-Streamable');
    expect(String(initializeSpan.attributes['mcp.transport']?.value)).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('tool handler preserves wrapper transport correlation', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /mcp');
    const toolSpanPromise = waitForMcpSpan('tools/call echo', 'Echo-Streamable');

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

    const [httpSpan, toolSpan] = await Promise.all([httpSpanPromise, toolSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, toolSpan);
    expect(toolSpan.attributes['mcp.method.name']?.value).toBe('tools/call');
    expect(toolSpan.attributes['gen_ai.operation.name']?.value).toBe('execute_tool');
    expect(toolSpan.attributes['gen_ai.tool.name']?.value).toBe('echo');
    expect(toolSpan.attributes['mcp.tool.name']?.value).toBe('echo');
    expect(toolSpan.attributes['mcp.tool.result.content_count']?.value).toBe(1);
  });

  await test.step('resource handler', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /mcp');
    const resourceSpanPromise = waitForMcpSpan('resources/read', 'Echo-Streamable');

    const resourceResult = await client.readResource({
      uri: 'echo://streamable-test',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: streamable-test', uri: 'echo://streamable-test' }],
    });

    const [httpSpan, resourceSpan] = await Promise.all([httpSpanPromise, resourceSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, resourceSpan);
    expect(resourceSpan.name).toBe('resources/read');
    expect(resourceSpan.attributes['mcp.method.name']?.value).toBe('resources/read');
  });

  await test.step('prompt handler', async () => {
    const httpSpanPromise = waitForHttpSpan('POST /mcp');
    const promptSpanPromise = waitForMcpSpan('prompts/get echo', 'Echo-Streamable');

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

    const [httpSpan, promptSpan] = await Promise.all([httpSpanPromise, promptSpanPromise]);
    expectMcpSpanToBeHttpChild(httpSpan, promptSpan);
    expect(promptSpan.attributes['mcp.method.name']?.value).toBe('prompts/get');
    expect(promptSpan.attributes['gen_ai.prompt.name']?.value).toBe('echo');
    expect(promptSpan.attributes['mcp.prompt.name']?.value).toBe('echo');
  });

  await client.close();
});
