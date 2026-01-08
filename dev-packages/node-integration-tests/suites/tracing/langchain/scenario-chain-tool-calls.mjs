import { RunnableLambda } from '@langchain/core/runnables';
import * as Sentry from '@sentry/node';

async function run() {
  // Create callback handler - tool_calls are captured regardless of recordOutputs
  const callbackHandler = Sentry.createLangChainCallbackHandler({
    recordInputs: false,
    recordOutputs: false,
  });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    // Test 1: Chain without tool calls
    const simpleChain = new RunnableLambda({
      func: input => {
        return { result: `Processed: ${input.query}` };
      },
    }).withConfig({ runName: 'simple_chain' });

    await simpleChain.invoke(
      { query: 'Hello world' },
      {
        callbacks: [callbackHandler],
      },
    );

    // Test 2: Chain with tool calls in output
    const chainWithToolCalls = new RunnableLambda({
      func: input => {
        return {
          result: `Processed with tools: ${input.query}`,
          messages: [
            {
              role: 'assistant',
              content: 'I will use the search tool',
              tool_calls: [
                {
                  name: 'search',
                  args: { query: input.query },
                  id: 'tool_call_123',
                },
                {
                  name: 'calculator',
                  args: { expression: '2+2' },
                  id: 'tool_call_456',
                },
              ],
            },
          ],
        };
      },
    }).withConfig({ runName: 'chain_with_tool_calls' });

    await chainWithToolCalls.invoke(
      { query: 'Search for something' },
      {
        callbacks: [callbackHandler],
      },
    );

    // Test 3: Chain with direct tool_calls on output (alternative format)
    const chainWithDirectToolCalls = new RunnableLambda({
      func: input => {
        return {
          result: `Direct tool calls: ${input.query}`,
          tool_calls: [
            {
              name: 'weather',
              args: { location: 'San Francisco' },
              id: 'tool_call_789',
            },
          ],
        };
      },
    }).withConfig({ runName: 'chain_with_direct_tool_calls' });

    await chainWithDirectToolCalls.invoke(
      { query: 'Get weather' },
      {
        callbacks: [callbackHandler],
      },
    );
  });

  await Sentry.flush(2000);
}

run();
