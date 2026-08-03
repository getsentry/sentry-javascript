import * as Sentry from '@sentry/cloudflare';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

export default Sentry.withSentry(
  (env: Env) => ({
    traceLifecycle: 'static',
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
    dataCollection: { genAI: { inputs: false, outputs: false } },
    integrations: [Sentry.vercelAIIntegration()],
  }),
  {
    async fetch(request, _env, _ctx) {
      const url = new URL(request.url);

      if (url.pathname === '/generate') {
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
          }),
          prompt: 'How much is the fish?',
        });

        return new Response('Here we go, here we go, here we go again');
      }

      return new Response('Not found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>,
);
