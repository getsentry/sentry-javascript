import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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
test('Should record transactions for streamable HTTP transport (wrapper transport pattern)', async ({ baseURL }) => {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`));

  const client = new Client({
    name: 'test-client-streamable',
    version: '1.0.0',
  });

  const initializeTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
    return (
      transactionEvent.transaction === 'initialize' &&
      transactionEvent.contexts?.trace?.data?.['mcp.server.name'] === 'Echo-Streamable'
    );
  });

  await client.connect(transport);

  await test.step('initialize handshake', async () => {
    const initializeTransaction = await initializeTransactionPromise;
    expect(initializeTransaction).toBeDefined();
    expect(initializeTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('initialize');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.client.name']).toEqual('test-client-streamable');
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.server.name']).toEqual('Echo-Streamable');
    // Verify it's using a StreamableHTTP transport (may be wrapper or inner depending on environment)
    expect(initializeTransaction.contexts?.trace?.data?.['mcp.transport']).toMatch(/StreamableHTTPServerTransport/);
  });

  await test.step('tool handler (tests wrapper transport correlation)', async () => {
    // This is the critical test - without the sessionId fix, the span would not be completed
    // because onmessage and send see different transport instances (wrapper vs inner)
    const toolTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      const transport = transactionEvent.contexts?.trace?.data?.['mcp.transport'] as string | undefined;
      return transactionEvent.transaction === 'tools/call echo' && transport?.includes('StreamableHTTPServerTransport');
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

    const toolTransaction = await toolTransactionPromise;
    expect(toolTransaction).toBeDefined();
    expect(toolTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(toolTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('tools/call');
    expect(toolTransaction.contexts?.trace?.data?.['mcp.tool.name']).toEqual('echo');
    // This attribute proves the span was completed with results (sessionId correlation worked)
    expect(toolTransaction.contexts?.trace?.data?.['mcp.tool.result.content_count']).toEqual(1);
  });

  await test.step('resource handler', async () => {
    const resourceTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      const transport = transactionEvent.contexts?.trace?.data?.['mcp.transport'] as string | undefined;
      return (
        transactionEvent.transaction === 'resources/read echo://streamable-test' &&
        transport?.includes('StreamableHTTPServerTransport')
      );
    });

    const resourceResult = await client.readResource({
      uri: 'echo://streamable-test',
    });

    expect(resourceResult).toMatchObject({
      contents: [{ text: 'Resource echo: streamable-test', uri: 'echo://streamable-test' }],
    });

    const resourceTransaction = await resourceTransactionPromise;
    expect(resourceTransaction).toBeDefined();
    expect(resourceTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(resourceTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('resources/read');
  });

  await test.step('prompt handler', async () => {
    const promptTransactionPromise = waitForTransaction('node-express-v5', transactionEvent => {
      const transport = transactionEvent.contexts?.trace?.data?.['mcp.transport'] as string | undefined;
      return (
        transactionEvent.transaction === 'prompts/get echo' && transport?.includes('StreamableHTTPServerTransport')
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

    const promptTransaction = await promptTransactionPromise;
    expect(promptTransaction).toBeDefined();
    expect(promptTransaction.contexts?.trace?.op).toEqual('mcp.server');
    expect(promptTransaction.contexts?.trace?.data?.['mcp.method.name']).toEqual('prompts/get');
  });

  // Clean up - close the client connection
  await client.close();
});
