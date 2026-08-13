import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const APP_NAME = 'node-express';

function waitForMcpTransaction(spanDescription: string, serverName: string) {
  return waitForTransaction(APP_NAME, transactionEvent => {
    return (
      transactionEvent.spans?.some(
        span =>
          span.op === 'mcp.server' &&
          span.description === spanDescription &&
          span.data?.['mcp.server.name'] === serverName,
      ) === true
    );
  });
}

function getMcpSpan(transactionEvent: Awaited<ReturnType<typeof waitForTransaction>>, spanDescription: string) {
  const span = transactionEvent.spans?.find(
    candidate => candidate.op === 'mcp.server' && candidate.description === spanDescription,
  );
  expect(span).toBeDefined();
  return span!;
}

function expectMcpSpanToBeHttpChild(
  transactionEvent: Awaited<ReturnType<typeof waitForTransaction>>,
  mcpSpan: ReturnType<typeof getMcpSpan>,
) {
  expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
  expect(mcpSpan.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);

  const rootSpanId = transactionEvent.contexts?.trace?.span_id;
  const spansById = new Map(transactionEvent.spans?.map(span => [span.span_id, span]));
  let parentSpanId = mcpSpan.parent_span_id;

  while (parentSpanId && parentSpanId !== rootSpanId) {
    const parentSpan = spansById.get(parentSpanId);
    expect(parentSpan).toBeDefined();
    parentSpanId = parentSpan?.parent_span_id;
  }

  expect(parentSpanId).toBe(rootSpanId);
}

test('records MCP handler spans inside legacy SSE HTTP transactions', async ({ baseURL }) => {
  const transport = new SSEClientTransport(new URL(`${baseURL}/sse`));
  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });
  const initializeTransactionPromise = waitForMcpTransaction('initialize', 'Echo');

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeTransaction = await initializeTransactionPromise;
    const initializeSpan = getMcpSpan(initializeTransaction, 'initialize');
    expectMcpSpanToBeHttpChild(initializeTransaction, initializeSpan);
    expect(initializeSpan.data?.['mcp.method.name']).toBe('initialize');
    expect(initializeSpan.data?.['mcp.client.name']).toBe('test-client');
    expect(initializeSpan.data?.['mcp.server.name']).toBe('Echo');
  });

  await test.step('tool handler', async () => {
    const toolTransactionPromise = waitForMcpTransaction('tools/call echo', 'Echo');

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

    const toolTransaction = await toolTransactionPromise;
    const toolSpan = getMcpSpan(toolTransaction, 'tools/call echo');
    expectMcpSpanToBeHttpChild(toolTransaction, toolSpan);
    expect(toolSpan.data?.['mcp.method.name']).toBe('tools/call');
    expect(toolSpan.data?.['gen_ai.operation.name']).toBe('execute_tool');
    expect(toolSpan.data?.['gen_ai.tool.name']).toBe('echo');
    expect(toolSpan.data?.['mcp.tool.name']).toBe('echo');
    expect(toolSpan.data?.['jsonrpc.request.id']).toBeDefined();
    expect(toolSpan.data?.['mcp.request.id']).toBe(toolSpan.data?.['jsonrpc.request.id']);
  });

  await test.step('registerTool handler', async () => {
    const toolTransactionPromise = waitForMcpTransaction('tools/call echo-register', 'Echo');

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

    const toolTransaction = await toolTransactionPromise;
    const toolSpan = getMcpSpan(toolTransaction, 'tools/call echo-register');
    expectMcpSpanToBeHttpChild(toolTransaction, toolSpan);
    expect(toolSpan.data?.['mcp.method.name']).toBe('tools/call');
    expect(toolSpan.data?.['gen_ai.tool.name']).toBe('echo-register');
    expect(toolSpan.data?.['mcp.tool.name']).toBe('echo-register');
  });

  await test.step('resource handler', async () => {
    const resourceTransactionPromise = waitForMcpTransaction('resources/read', 'Echo');

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const resourceTransaction = await resourceTransactionPromise;
    const resourceSpan = getMcpSpan(resourceTransaction, 'resources/read');
    expectMcpSpanToBeHttpChild(resourceTransaction, resourceSpan);
    expect(resourceSpan.description).toBe('resources/read');
    expect(resourceSpan.data?.['mcp.method.name']).toBe('resources/read');
  });

  await test.step('prompt handler', async () => {
    const promptTransactionPromise = waitForMcpTransaction('prompts/get echo', 'Echo');

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

    const promptTransaction = await promptTransactionPromise;
    const promptSpan = getMcpSpan(promptTransaction, 'prompts/get echo');
    expectMcpSpanToBeHttpChild(promptTransaction, promptSpan);
    expect(promptSpan.data?.['mcp.method.name']).toBe('prompts/get');
    expect(promptSpan.data?.['gen_ai.prompt.name']).toBe('echo');
    expect(promptSpan.data?.['mcp.prompt.name']).toBe('echo');
  });

  await test.step('error tool sets span status to internal_error', async () => {
    const toolTransactionPromise = waitForMcpTransaction('tools/call always-error', 'Echo');

    await expect(client.callTool({ name: 'always-error', arguments: {} })).resolves.toMatchObject({ isError: true });

    const toolTransaction = await toolTransactionPromise;
    const toolSpan = getMcpSpan(toolTransaction, 'tools/call always-error');
    expectMcpSpanToBeHttpChild(toolTransaction, toolSpan);
    expect(toolSpan.status).toBe('internal_error');
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
test('records MCP handler spans inside streamable HTTP transactions', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));
  const client = new Client({
    name: 'test-client-streamable',
    version: '1.0.0',
  });
  const initializeTransactionPromise = waitForMcpTransaction('initialize', 'Echo-Streamable');

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeTransaction = await initializeTransactionPromise;
    const initializeSpan = getMcpSpan(initializeTransaction, 'initialize');
    expectMcpSpanToBeHttpChild(initializeTransaction, initializeSpan);
    expect(initializeSpan.data?.['mcp.method.name']).toBe('initialize');
    expect(initializeSpan.data?.['mcp.client.name']).toBe('test-client-streamable');
    expect(initializeSpan.data?.['mcp.server.name']).toBe('Echo-Streamable');
    expect(initializeSpan.data?.['mcp.transport']).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('tool handler preserves wrapper transport correlation', async () => {
    const toolTransactionPromise = waitForMcpTransaction('tools/call echo', 'Echo-Streamable');

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

    const toolTransaction = await toolTransactionPromise;
    const toolSpan = getMcpSpan(toolTransaction, 'tools/call echo');
    expectMcpSpanToBeHttpChild(toolTransaction, toolSpan);
    expect(toolSpan.data?.['mcp.method.name']).toBe('tools/call');
    expect(toolSpan.data?.['gen_ai.tool.name']).toBe('echo');
    expect(toolSpan.data?.['mcp.tool.name']).toBe('echo');
    expect(toolSpan.data?.['mcp.tool.result.content_count']).toBe(1);
  });

  await test.step('resource handler', async () => {
    const resourceTransactionPromise = waitForMcpTransaction('resources/read', 'Echo-Streamable');

    const resourceResult = await client.readResource({
      uri: 'echo://streamable-test',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: streamable-test', uri: 'echo://streamable-test' }],
    });

    const resourceTransaction = await resourceTransactionPromise;
    const resourceSpan = getMcpSpan(resourceTransaction, 'resources/read');
    expectMcpSpanToBeHttpChild(resourceTransaction, resourceSpan);
    expect(resourceSpan.description).toBe('resources/read');
    expect(resourceSpan.data?.['mcp.method.name']).toBe('resources/read');
  });

  await test.step('prompt handler', async () => {
    const promptTransactionPromise = waitForMcpTransaction('prompts/get echo', 'Echo-Streamable');

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

    const promptTransaction = await promptTransactionPromise;
    const promptSpan = getMcpSpan(promptTransaction, 'prompts/get echo');
    expectMcpSpanToBeHttpChild(promptTransaction, promptSpan);
    expect(promptSpan.data?.['mcp.method.name']).toBe('prompts/get');
  });

  await client.close();
});
