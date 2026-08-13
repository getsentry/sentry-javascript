import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const APP_NAME = 'node-express-mcp-v2';

function waitForMcpTransaction(spanDescription: string) {
  return waitForTransaction(APP_NAME, transactionEvent => {
    return transactionEvent.spans?.some(span => span.op === 'mcp.server' && span.description === spanDescription);
  });
}

function getMcpSpan(transactionEvent: Awaited<ReturnType<typeof waitForTransaction>>, spanDescription: string) {
  const span = transactionEvent.spans?.find(
    candidate => candidate.op === 'mcp.server' && candidate.description === spanDescription,
  );
  expect(span).toBeDefined();
  return span!;
}

function expectMcpSpanToBeHttpDescendant(
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

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const MODERN_CLIENT_METADATA = {
  'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientInfo': {
    name: 'test-client-2026',
    version: '1.0.0',
  },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function sendModernRequest(
  baseURL: string,
  message: { id: string; method: string; params: Record<string, unknown> },
  name?: string,
) {
  return fetch(`${baseURL}/mcp-modern`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MODERN_PROTOCOL_VERSION,
      'Mcp-Method': message.method,
      ...(name ? { 'Mcp-Name': name } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', ...message }),
  });
}

test('records child spans for stable MCP SDK v2 handlers using the register API', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-v2',
    version: '1.0.0',
  });

  const initializeTransactionPromise = waitForMcpTransaction('initialize');

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeTransaction = await initializeTransactionPromise;
    const initializeSpan = getMcpSpan(initializeTransaction, 'initialize');
    expectMcpSpanToBeHttpDescendant(initializeTransaction, initializeSpan);
    expect(initializeSpan.data?.['mcp.method.name']).toEqual('initialize');
    expect(initializeSpan.data?.['mcp.client.name']).toEqual('test-client-v2');
    expect(initializeSpan.data?.['mcp.server.name']).toEqual('Echo-V2');
    expect(initializeSpan.data?.['mcp.transport']).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('registerTool handler', async () => {
    const toolTransactionPromise = waitForMcpTransaction('tools/call echo');

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
    expectMcpSpanToBeHttpDescendant(toolTransaction, toolSpan);
    expect(toolSpan.data?.['mcp.method.name']).toEqual('tools/call');
    expect(toolSpan.data?.['gen_ai.operation.name']).toEqual('execute_tool');
    expect(toolSpan.data?.['gen_ai.tool.name']).toEqual('echo');
    expect(toolSpan.data?.['mcp.tool.name']).toEqual('echo');
    expect(toolSpan.data?.['mcp.tool.result.content_count']).toEqual(1);
  });

  await test.step('registerResource handler', async () => {
    const resourceTransactionPromise = waitForMcpTransaction('resources/read');

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const resourceTransaction = await resourceTransactionPromise;
    const resourceSpan = getMcpSpan(resourceTransaction, 'resources/read');
    expectMcpSpanToBeHttpDescendant(resourceTransaction, resourceSpan);
    expect(resourceSpan.data?.['mcp.method.name']).toEqual('resources/read');
  });

  await test.step('registerPrompt handler', async () => {
    const promptTransactionPromise = waitForMcpTransaction('prompts/get echo');

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
    expectMcpSpanToBeHttpDescendant(promptTransaction, promptSpan);
    expect(promptSpan.data?.['mcp.method.name']).toEqual('prompts/get');
  });

  await test.step('error tool sets span status to internal_error', async () => {
    const toolTransactionPromise = waitForMcpTransaction('tools/call always-error');

    try {
      await client.callTool({ name: 'always-error', arguments: {} });
    } catch {
      // Expected: MCP SDK throws when the tool returns a JSON-RPC error
    }

    const toolTransaction = await toolTransactionPromise;
    const toolSpan = getMcpSpan(toolTransaction, 'tools/call always-error');
    expectMcpSpanToBeHttpDescendant(toolTransaction, toolSpan);
    expect(toolSpan.status).toEqual('internal_error');
  });

  await client.close();
});

test('records stateless MCP 2026-07-28 requests with canonical attributes', async ({ baseURL }) => {
  const discoverTransactionPromise = waitForMcpTransaction('server/discover');
  const discoverResponse = await sendModernRequest(baseURL!, {
    id: 'modern-discover',
    method: 'server/discover',
    params: { _meta: MODERN_CLIENT_METADATA },
  });
  expect(discoverResponse.status).toBe(200);
  await expect(discoverResponse.json()).resolves.toMatchObject({
    jsonrpc: '2.0',
    id: 'modern-discover',
    result: {
      resultType: 'complete',
      supportedVersions: [MODERN_PROTOCOL_VERSION],
    },
  });

  const discoverTransaction = await discoverTransactionPromise;
  const discoverSpan = getMcpSpan(discoverTransaction, 'server/discover');
  expectMcpSpanToBeHttpDescendant(discoverTransaction, discoverSpan);
  expect(discoverSpan.data).toMatchObject({
    'mcp.client.name': 'test-client-2026',
    'mcp.method.name': 'server/discover',
    'mcp.protocol.version': '2026-07-28',
    'mcp.result.type': 'complete',
    'mcp.server.name': 'Echo-2026',
    'sentry.kind': 'server',
  });
  expect(discoverSpan.data?.['mcp.session.id']).toBeUndefined();

  const toolTransactionPromise = waitForMcpTransaction('tools/call echo-modern');
  const toolResponse = await sendModernRequest(
    baseURL!,
    {
      id: 'modern-tool-call',
      method: 'tools/call',
      params: {
        _meta: MODERN_CLIENT_METADATA,
        name: 'echo-modern',
        arguments: { message: 'modern payload' },
      },
    },
    'echo-modern',
  );
  expect(toolResponse.status).toBe(200);
  await expect(toolResponse.json()).resolves.toMatchObject({
    jsonrpc: '2.0',
    id: 'modern-tool-call',
    result: {
      resultType: 'complete',
      content: [{ type: 'text', text: 'Modern tool echo: modern payload' }],
      structuredContent: { echoed: 'modern payload' },
    },
  });

  const toolTransaction = await toolTransactionPromise;
  const toolSpan = getMcpSpan(toolTransaction, 'tools/call echo-modern');
  expectMcpSpanToBeHttpDescendant(toolTransaction, toolSpan);
  expect(toolSpan.data).toMatchObject({
    'gen_ai.operation.name': 'execute_tool',
    'gen_ai.tool.call.arguments': '{"message":"modern payload"}',
    'gen_ai.tool.call.result': '{"echoed":"modern payload"}',
    'gen_ai.tool.name': 'echo-modern',
    'mcp.method.name': 'tools/call',
    'mcp.protocol.version': '2026-07-28',
    'mcp.result.type': 'complete',
    'mcp.tool.name': 'echo-modern',
    'sentry.kind': 'server',
  });
  expect(toolSpan.data?.['jsonrpc.request.id']).toBeDefined();
  expect(toolSpan.data?.['mcp.session.id']).toBeUndefined();
});
