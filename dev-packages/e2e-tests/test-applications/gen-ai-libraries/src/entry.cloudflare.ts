// The Cloudflare variant: the same libraries and routes as the Node entry, but instrumented by the
// `@sentry/cloudflare/vite` bundler plugin (build-time channel injection) and run on workerd.
import * as Sentry from '@sentry/cloudflare';
import { libraries } from './libraries';

const byId = new Map(libraries.map(library => [library.id, library]));

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.E2E_TEST_DSN,
    environment: 'qa',
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1.0,
  }),
  {
    async fetch(request, env, _ctx) {
      const url = new URL(request.url);
      const [, id, action] = url.pathname.split('/');
      const library = id ? byId.get(id) : undefined;

      if (!library || (action !== 'chat' && action !== 'tools')) {
        return new Response('Not found', { status: 404 });
      }

      const apiKey = env.E2E_OPENROUTER_API_KEY;
      if (!apiKey) {
        return new Response('E2E_OPENROUTER_API_KEY is not set', { status: 500 });
      }

      try {
        const spanName = action === 'tools' ? 'ai-tool-workflow' : 'ai-workflow';
        const result = await Sentry.startSpan({ name: spanName, op: 'function' }, () => library[action](apiKey));
        return Response.json({ result });
      } catch (error) {
        return Response.json({ message: (error as Error).message }, { status: 500 });
      }
    },
  } satisfies ExportedHandler<Env>,
);
