import { wrapRequestHandler } from '@sentry/cloudflare/request';

interface Env {
  SENTRY_DSN: string;
}

// Mirrors how Hydrogen (Remix) uses the SDK: only `wrapRequestHandler` from the
// `/request` subpath, without `nodejs_compat` compatibility flags.
// The subpath must stay free of Node.js-only modules.
export default {
  async fetch(request, env, ctx) {
    return wrapRequestHandler(
      {
        options: {
          dsn: env.SENTRY_DSN,
          traceLifecycle: 'static',
          tracesSampleRate: 1,
        },
        request,
        context: ctx,
      },
      () => new Response('ok'),
    );
  },
} satisfies ExportedHandler<Env>;
