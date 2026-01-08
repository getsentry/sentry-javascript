import * as Sentry from '@sentry/cloudflare';
import { MockChain, MockChatModel, MockTool } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Create LangChain callback handler
      const callbackHandler = Sentry.createLangChainCallbackHandler({
        recordInputs: false,
        recordOutputs: false,
      });

      // Create LangChain callback handler with recordOutputs enabled for tool_calls test
      const callbackHandlerWithOutputs = Sentry.createLangChainCallbackHandler({
        recordInputs: false,
        recordOutputs: true,
      });

      // Test 1: Chat model invocation
      const chatModel = new MockChatModel({
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 100,
      });

      await chatModel.invoke('Tell me a joke', {
        callbacks: [callbackHandler],
      });

      // Test 2: Chain invocation
      const chain = new MockChain('my_test_chain');
      await chain.invoke(
        { input: 'test input' },
        {
          callbacks: [callbackHandler],
        },
      );

      // Test 3: Tool invocation
      const tool = new MockTool('search_tool');
      await tool.call('search query', {
        callbacks: [callbackHandler],
      });

      // Test 4: Chain invocation with tool calls
      const chainWithToolCalls = new MockChain('chain_with_tool_calls', { includeToolCalls: true });
      await chainWithToolCalls.invoke(
        { input: 'test input for tool calls' },
        {
          callbacks: [callbackHandlerWithOutputs],
        },
      );

      return new Response(JSON.stringify({ success: true }));
    },
  },
);
