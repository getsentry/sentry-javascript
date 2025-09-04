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

  await client.connect(transport);

  await test.step('tool handler', async () => {
    const postTransactionPromise = waitForTransaction('node-express', transactionEvent => {
      return transactionEvent.transaction === 'POST /messages';
    });
    const toolTransactionPromise = waitForTransaction('node-express', transactionEvent => {
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
    expect(postTransaction.contexts?.trace?.op).toEqual('http.server');

    const toolTransaction = await toolTransactionPromise;
    expect(toolTransaction).toBeDefined();
    expect(toolTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(toolTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('tools/call');
    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('resource handler', async () => {
    const postTransactionPromise = waitForTransaction('node-express', transactionEvent => {
      return transactionEvent.transaction === 'POST /messages';
    });
    const resourceTransactionPromise = waitForTransaction('node-express', transactionEvent => {
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
    expect(postTransaction.contexts?.trace?.op).toEqual('http.server');

    const resourceTransaction = await resourceTransactionPromise;
    expect(resourceTransaction).toBeDefined();
    expect(resourceTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(resourceTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('resources/read');
    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });

  await test.step('prompt handler', async () => {
    const postTransactionPromise = waitForTransaction('node-express', transactionEvent => {
      return transactionEvent.transaction === 'POST /messages';
    });
    const promptTransactionPromise = waitForTransaction('node-express', transactionEvent => {
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
    expect(postTransaction.contexts?.trace?.op).toEqual('http.server');

    const promptTransaction = await promptTransactionPromise;
    expect(promptTransaction).toBeDefined();
    expect(promptTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(promptTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('prompts/get');
    // TODO: When https://github.com/modelcontextprotocol/typescript-sdk/pull/358 is released check for trace id equality between the post transaction and the handler transaction
  });
});
