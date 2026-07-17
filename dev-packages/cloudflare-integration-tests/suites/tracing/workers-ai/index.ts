import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// A stand-in for the `env.AI` binding whose `run` rejects, so we can assert that a
// failing Workers AI call bubbles up out of the handler and is reported by the
// top-level Cloudflare instrumentation, rather than being captured inside the
// Workers AI integration itself.
const ai = {
  run: async (_model: string, _inputs: Record<string, unknown>) => {
    throw new Error('Workers AI run failed');
  },
};

const instrumentedAi = Sentry.instrumentWorkersAiClient(ai);

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    async fetch(_request, _env, _ctx) {
      const result = await instrumentedAi.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });

      return new Response(JSON.stringify(result));
    },
  },
);
