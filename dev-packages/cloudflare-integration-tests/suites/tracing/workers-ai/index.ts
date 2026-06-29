import * as Sentry from '@sentry/cloudflare';
import { MockAi } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

const ai = Sentry.instrumentWorkersAiClient(new MockAi());

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // Keep gen_ai spans embedded in the transaction (instead of streamed as a
    // separate envelope container) so they can be asserted on `transaction.spans`.
    streamGenAiSpans: false,
  }),
  {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === '/stream') {
        const stream = (await ai.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: 'What is the capital of France?' }],
          stream: true,
        })) as ReadableStream;

        const text = await new Response(stream).text();
        return new Response(text);
      }

      const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return new Response(JSON.stringify(result));
    },
  },
);
