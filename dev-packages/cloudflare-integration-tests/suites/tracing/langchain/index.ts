import { ChatOpenAI } from '@langchain/openai';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// Return a canned response so the `@langchain/openai` model (backed by the
// `openai` SDK) runs on workerd without hitting the network.
const mockFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      id: 'chatcmpl-mock123',
      object: 'chat.completion',
      created: 1677652288,
      model: 'gpt-3.5-turbo',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from LangChain!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    streamGenAiSpans: true,
  }),
  {
    async fetch(_request, _env, _ctx) {
      const callbackHandler = Sentry.createLangChainCallbackHandler({
        recordInputs: false,
        recordOutputs: false,
      });

      const model = new ChatOpenAI({
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 100,
        apiKey: 'mock-api-key',
        configuration: { fetch: mockFetch },
        callbacks: [callbackHandler],
      });

      await model.invoke('Tell me a joke');

      return new Response(JSON.stringify({ success: true }));
    },
  },
);
