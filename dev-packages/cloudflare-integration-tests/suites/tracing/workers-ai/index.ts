import * as Sentry from '@sentry/cloudflare';
import { instrumentWorkersAiClient } from '@sentry/core';
import { MockAi } from './mocks';

interface Env {
  SENTRY_DSN: string;
}

// Stands in for the `env.AI` binding: the binding object exists before the request, but is only
// reachable through `env` inside the handler.
const aiBinding = new MockAi();

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1.0,
    // Responses only. Asserting that prompts are *absent* is what makes this suite fail if the
    // binding is ever wrapped before the SDK is initialized again, since the fallback collects both.
    dataCollection: { genAI: { inputs: false, outputs: true } },
    // Keep gen_ai spans embedded in the transaction (instead of streamed as a
    // separate envelope container) so they can be asserted on `transaction.spans`.
    streamGenAiSpans: false,
  }),
  {
    async fetch(request) {
      // Wrapped in-request, mirroring how `@sentry/cloudflare` instruments `env.AI` on first
      // property access: after `withSentry` has initialized the SDK, so `dataCollection.genAI`
      // is visible when recording options are resolved.
      const ai = instrumentWorkersAiClient(aiBinding);

      const url = new URL(request.url);

      if (url.pathname === '/error') {
        // The Workers AI integration deliberately does not call `captureException` itself.
        // A failing `run` must bubble up out of the handler so the top-level Cloudflare
        // instrumentation reports it instead — showing up in Sentry exactly once.
        const result = await ai.run('error-model', { prompt: 'Hello' });
        return new Response(JSON.stringify(result));
      }

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
