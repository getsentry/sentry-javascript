import * as Sentry from '@sentry/cloudflare';
import { type CallbackHandler, MockChain, MockChatModel, MockTool } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    streamGenAiSpans: true,
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Create LangChain callback handler
      // The mock models accept their own local `CallbackHandler` shape, which differs from the SDK's handler type.
      const callbackHandler = Sentry.createLangChainCallbackHandler({
        recordInputs: false,
        recordOutputs: false,
      }) as unknown as CallbackHandler;

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

      return new Response(JSON.stringify({ success: true }));
    },
  },
);
