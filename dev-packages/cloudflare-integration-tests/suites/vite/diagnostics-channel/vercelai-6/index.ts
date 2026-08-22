import * as Sentry from '@sentry/cloudflare';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    traceLifecycle: 'static',
    tracesSampleRate: 1,
    // The Vercel AI SDK emits its spans through `@opentelemetry/api`, so they are only picked up when
    // the Cloudflare OpenTelemetry tracer provider is set up.
    enableOpenTelemetrySetup: true,
  }),
  {
    async fetch(_request, _env, _ctx) {
      await generateText({
        experimental_telemetry: { isEnabled: true },
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 10, noCache: 10, cached: 0 },
              outputTokens: { total: 20, noCache: 20, cached: 0 },
              totalTokens: { total: 30, noCache: 30, cached: 0 },
            },
            content: [{ type: 'text', text: 'Hello from mock AI!' }],
            warnings: [],
          }),
          // The mock result shape differs from this `ai` version's LanguageModelV3 result type; cast to the mock's expected config.
        } as unknown as ConstructorParameters<typeof MockLanguageModelV3>[0]),
        prompt: 'Where is the first span?',
      });

      return new Response('ok');
    },
  },
);
