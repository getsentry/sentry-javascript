import * as Sentry from '@sentry/cloudflare';
import { MockOpenAi } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

const mockClient = new MockOpenAi({
  apiKey: 'mock-api-key',
});

const client = Sentry.instrumentOpenAiClient(mockClient);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      const response = await client.chat?.completions?.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return new Response(JSON.stringify(response));
    },
  },
);
