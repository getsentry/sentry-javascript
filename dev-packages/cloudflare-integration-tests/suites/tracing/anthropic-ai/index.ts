import * as Sentry from '@sentry/cloudflare';
import type { AnthropicAiClient } from '@sentry/core';
import { MockAnthropic } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

const mockClient = new MockAnthropic({
  apiKey: 'mock-api-key',
});

const client: AnthropicAiClient = Sentry.instrumentAnthropicAiClient(mockClient);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(_request, _env, _ctx) {
      const response = await client.messages?.create({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
        temperature: 0.7,
        max_tokens: 100,
      });

      return new Response(JSON.stringify(response));
    },
  },
);
