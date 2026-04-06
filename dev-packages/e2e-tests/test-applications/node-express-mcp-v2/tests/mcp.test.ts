import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

test('Should record transactions for MCP handlers using @modelcontextprotocol/sdk v2 (register* API)', async ({
  baseURL,
}) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-v2',
    version: '1.0.0',
  });

  const initializeTransactionPromise = waitForTransaction('node-express-mcp-v2', transactionEvent => {
    return transactionEvent.transaction === 'initialize';
  });

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeTransaction = await initializeTransactionPromise;
    expect(initializeTransaction).toBeDefined();
    expect(initializeTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('initialize');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.client.name']).toEqual('test-client-v2');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.server.name']).toEqual('Echo-V2');
  });

  await test.step('registerTool handler', async () => {
    const toolTransactionPromise = waitForTransaction('node-express-mcp-v2', transactionEvent => {
      return transactionEvent.transaction === 'tools/call echo';
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

    const toolTransaction = await toolTransactionPromise;
    expect(toolTransaction).toBeDefined();
    expect(toolTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(toolTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('tools/call');
    expect(toolTransaction.contexts?.trace?.data?.['mcp.tool.name']).toEqual('echo');
  });

  await test.step('registerResource handler', async () => {
    const resourceTransactionPromise = waitForTransaction('node-express-mcp-v2', transactionEvent => {
      return transactionEvent.transaction === 'resources/read echo://foobar';
    });

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const resourceTransaction = await resourceTransactionPromise;
    expect(resourceTransaction).toBeDefined();
    expect(resourceTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(resourceTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('resources/read');
  });

  await test.step('registerPrompt handler', async () => {
    const promptTransactionPromise = waitForTransaction('node-express-mcp-v2', transactionEvent => {
      return transactionEvent.transaction === 'prompts/get echo';
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

    const promptTransaction = await promptTransactionPromise;
    expect(promptTransaction).toBeDefined();
    expect(promptTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(promptTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('prompts/get');
  });

  await test.step('error tool sets span status to internal_error', async () => {
    const toolTransactionPromise = waitForTransaction('node-express-mcp-v2', transactionEvent => {
      return transactionEvent.transaction === 'tools/call always-error';
    });

    try {
      await client.callTool({ name: 'always-error', arguments: {} });
    } catch {
      // Expected: MCP SDK throws when the tool returns a JSON-RPC error
    }

    const toolTransaction = await toolTransactionPromise;
    expect(toolTransaction).toBeDefined();
    expect(toolTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(toolTransaction.contexts?.trace?.status).toEqual('internal_error');
  });

  await client.close();
});
