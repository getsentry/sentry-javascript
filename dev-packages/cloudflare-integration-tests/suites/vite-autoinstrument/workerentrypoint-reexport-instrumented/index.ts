import { GreeterEntrypoint } from './greeter';

interface Env {
  SENTRY_DSN: string;
  SELF: Fetcher;
}

// `GreeterEntrypoint` was already wrapped by hand in `./greeter`. The
// auto-instrument transform cannot see that from this entry (it only knows the
// class from the self service binding in wrangler.jsonc), so it emits its
// wrapper behind `_INTERNAL_wrapUnlessInstrumented`, which hands the manual
// wrap back unchanged instead of nesting a second wrapper around it.
export { GreeterEntrypoint };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/call-entrypoint') {
      return env.SELF.fetch(new Request('https://self/greet'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
