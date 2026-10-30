import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

// A plain worker. The `@sentry/cloudflare/vite` plugin wraps it with `withSentry` at build time,
// with the options from `instrument.server.ts`.
export default {
  async fetch(): Promise<Response> {
    const userId = 42;
    Sentry.captureMessage(Sentry.parameterize`User ${userId} logged in`);
    return new Response('ok');
  },
} satisfies ExportedHandler<Env>;
