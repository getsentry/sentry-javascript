import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

test('Should record transactions for mcp handlers', async ({ baseURL }) => {
  const transport = new SSEClientTransport(new URL(`${baseURL}/sse`));

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  const initializeTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
    return transactionEvent.transaction === 'initialize';
  });

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeTransaction = await initializeTransactionPromise;
    expect(initializeTransaction).toBeDefined();
    expect(initializeTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('initialize');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.client.name']).toEqual('test-client');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.server.name']).toEqual('Echo');
  });

  await test.step('tool handler', async () => {
    const postTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      return transactionEvent.transaction === 'POST /messages';
    });
    const toolTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
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

    const postTransaction = await postTransactionPromise;
    expect(postTransaction).toBeDefined();

    const toolTransaction = await toolTransactionPromise;
    expect(toolTransaction).toBeDefined();

    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('resource handler', async () => {
    const postTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      return transactionEvent.transaction === 'POST /messages';
    });
    const resourceTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      return transactionEvent.transaction === 'resources/read echo://foobar';
    });

    const resourceResult = await client.readResource({
      uri: 'echo://foobar',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: foobar', uri: 'echo://foobar' }],
    });

    const postTransaction = await postTransactionPromise;
    expect(postTransaction).toBeDefined();

    const resourceTransaction = await resourceTransactionPromise;
    expect(resourceTransaction).toBeDefined();

    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('prompt handler', async () => {
    const postTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      return transactionEvent.transaction === 'POST /messages';
    });
    const promptTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
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

    const postTransaction = await postTransactionPromise;
    expect(postTransaction).toBeDefined();

    const promptTransaction = await promptTransactionPromise;
    expect(promptTransaction).toBeDefined();

    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });
});
